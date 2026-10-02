
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { PrismaClient, Role, BookingStatus, CourtStatus } from "@prisma/client";
import storeRoutes from "./routes/store.js";
import menuRoutes from "./routes/menu.js";
import { createKPayCheckout, kpayIsConfigured, verifyKPaySignature } from "./services/kpay.js";

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 8000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const coachUploadPath=fileURLToPath(new URL("../uploads/coaches/",import.meta.url));
const courseUploadPath=fileURLToPath(new URL("../uploads/courses/",import.meta.url));

app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || ["http://localhost:5173"], credentials: true }));
app.use(express.json({limit:"8mb",verify:(req:any,_res,buffer)=>{req.rawBody=Buffer.from(buffer)}}));
app.use("/uploads/coaches",express.static(coachUploadPath));
app.use("/uploads/courses",express.static(courseUploadPath));

// Store/POS and Cafe menu routes. These must be registered on the actual server entrypoint
// (src/server.ts); src/app.ts is not used by the dev/start scripts.
app.use("/api/store", storeRoutes);
app.use("/api/menu", menuRoutes);

type AuthRequest = Request & { user?: { id: string; role: Role; email: string; name: string } };

function tokenFor(user: { id: string; role: Role; email: string; name: string }) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

async function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required" });
  try {
    const claims=jwt.verify(header.slice(7), JWT_SECRET) as AuthRequest["user"];
    if(!claims?.id) return res.status(401).json({message:"Invalid or expired token"});
    const current=await prisma.user.findUnique({where:{id:claims.id},select:{id:true,role:true,email:true,name:true,active:true}});
    if(!current||!current.active) return res.status(401).json({message:"This account is inactive. Contact an administrator."});
    req.user={id:current.id,role:current.role,email:current.email,name:current.name};
    next();
  } catch { return res.status(401).json({ message: "Invalid or expired token" }); }
}

function roles(...allowed: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) return res.status(403).json({ message: "Insufficient permissions" });
    next();
  };
}

const asyncRoute = (fn: (...args: any[]) => any) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
const today = () => new Date().toISOString().slice(0, 10);
const code = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;
const publicApiUrl = () => (process.env.PUBLIC_API_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const clientUrl = () => (process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].replace(/\/$/, "");
async function startKPayAttempt(userId:string, resourceType:string, resourceId:string, amount:number, description:string) {
  if (!kpayIsConfigured()) throw Object.assign(new Error("KPay checkout is not configured yet. No payment or booking was created."),{statusCode:503});
  const reference=code("KP");
  const attempt=await prisma.paymentAttempt.create({data:{reference,userId,resourceType,resourceId,amount,expiresAt:new Date(Date.now()+15*60*1000)}});
  try {
    const checkout=await createKPayCheckout({reference,amount,currency:"MMK",description,callbackUrl:process.env.KPAY_CALLBACK_URL||`${publicApiUrl()}/api/payments/kpay/webhook`,returnUrl:`${clientUrl()}/payment/${attempt.id}`});
    return await prisma.paymentAttempt.update({where:{id:attempt.id},data:{providerReference:checkout.providerReference,checkoutUrl:checkout.checkoutUrl,qrCode:checkout.qrCode,status:"PENDING"}});
  } catch(error) { await prisma.paymentAttempt.delete({where:{id:attempt.id}}); throw error; }
}
async function expirePrivateCourseReservations(){
  const now=new Date();
  const expired=await prisma.booking.findMany({where:{kind:"private_course",status:{in:["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"]},reservationExpiresAt:{lte:now}},select:{id:true,userId:true,title:true,date:true,time:true}});
  for(const booking of expired){
    const result=await prisma.booking.updateMany({where:{id:booking.id,status:{in:["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"]},reservationExpiresAt:{lte:now}},data:{status:"EXPIRED"}});
    if(result.count)await prisma.notification.create({data:{userId:booking.userId,title:"Private course request expired",body:`${booking.title} on ${booking.date} at ${booking.time} expired and the court reservation was released.`,link:"/bookings",audience:"member",type:"booking"}});
  }
  const attempts=await prisma.paymentAttempt.findMany({where:{status:"PENDING",expiresAt:{lte:now}}});
  for(const attempt of attempts)await prisma.$transaction(async tx=>{
    const changed=await tx.paymentAttempt.updateMany({where:{id:attempt.id,status:"PENDING",expiresAt:{lte:now}},data:{status:"EXPIRED",failureReason:"Checkout expired"}});if(!changed.count)return;
    if(["court","private_course","booking"].includes(attempt.resourceType))await tx.booking.updateMany({where:{id:attempt.resourceId,status:"AWAITING_PAYMENT"},data:{status:"EXPIRED",reservationExpiresAt:null}});
    if(attempt.resourceType==="badminton_package")await tx.badmintonPackagePurchase.updateMany({where:{id:attempt.resourceId,status:"PENDING"},data:{status:"PAYMENT_EXPIRED"}});
    await tx.notification.create({data:{userId:attempt.userId,title:"Payment session expired",body:"Your KPay checkout expired. No payment was recorded; you can start a new checkout.",link:attempt.resourceType==="badminton_package"?"/membership":"/bookings",audience:"member",type:"payment",icon:"clock",entityType:attempt.resourceType,entityId:attempt.resourceId}});
  });
}
const normalizeTime24 = (value:string) => {
  const v=value.trim();
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(!m) return null;
  let h=Number(m[1]); const min=Number(m[2]); if(h===12)h=0; if(m[3].toUpperCase()==="PM")h+=12;
  return `${String(h).padStart(2,"0")}:${m[2]}`;
};

// Keep the booking board usable even when an existing SQLite database has not
// yet been migrated to the new court-block / holiday-rate tables. The Prisma
// migration remains the canonical deployment path; these IF NOT EXISTS guards
// make local development upgrades safe.
async function ensureStorePosTables() {
  // Legacy Product tables can predate the Store/POS extensions. Inspect the
  // actual SQLite columns and add only what is missing.
  const cols = await prisma.$queryRawUnsafe<any[]>(`PRAGMA table_info("Product")`);
  const names = new Set(cols.map(c => String(c.name)));
  if (!names.has("categoryId")) await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId")`);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ProductCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_name_key" ON "ProductCategory"("name")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CafeMenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`INSERT OR IGNORE INTO "ProductCategory" ("id","name","active") VALUES
    ('seed-cat-apparel','Apparel',1),('seed-cat-equipment','Equipment',1),('seed-cat-accessories','Accessories',1)`);
  await prisma.$executeRawUnsafe(`INSERT OR IGNORE INTO "CafeMenuItem" ("id","name","category","description","price","available") VALUES
    ('seed-menu-americano','Iced Americano','Coffee','Cold brewed espresso over ice.',5000,1),
    ('seed-menu-wrap','Chicken Wrap','Food','Chicken wrap for a quick post-training meal.',9000,1),
    ('seed-menu-bowl','Protein Bowl','Healthy','Protein-focused bowl.',12000,1)`);
}

async function ensureBadmintonBookingTables() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CourtBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'class',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourtBlock_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CourtBlock_courtId_date_idx" ON "CourtBlock"("courtId", "date")`);
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "CourtBlock" ADD COLUMN "dayOfWeek" INTEGER`); } catch {}
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "CourtBlock" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true`); } catch {}
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CourtBlock_courtId_dayOfWeek_idx" ON "CourtBlock"("courtId", "dayOfWeek")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "HolidayRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 30000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "HolidayRate_date_key" ON "HolidayRate"("date")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BadmintonEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY, "studentId" TEXT NOT NULL, "studentName" TEXT NOT NULL,
    "phone" TEXT NOT NULL, "packageId" TEXT NOT NULL, "packageName" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL, "sessionsRemaining" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL, "expiryDate" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active',
    "renewalCount" INTEGER NOT NULL DEFAULT 0, "lastCheckIn" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BadmintonEnrollment_studentId_idx" ON "BadmintonEnrollment"("studentId")`);
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "BadmintonEnrollment" ADD COLUMN "lastCheckIn" TEXT`); } catch {}
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "BadmintonEnrollment" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`); } catch {}
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BadmintonEnrollment_userId_idx" ON "BadmintonEnrollment"("userId")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BadmintonCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY, "enrollmentId" TEXT NOT NULL, "date" TEXT NOT NULL,
    "time" TEXT NOT NULL, "sessionsUsed" INTEGER NOT NULL DEFAULT 1, "staffId" TEXT, "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BadmintonCheckIn_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "BadmintonEnrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BadmintonCheckIn_enrollmentId_date_idx" ON "BadmintonCheckIn"("enrollmentId","date")`);
}

async function ensurePrivateCourseTables(){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PrivateCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,"title" TEXT NOT NULL,"description" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL DEFAULT 60,"price" INTEGER NOT NULL,"status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PrivateCourse_status_title_idx" ON "PrivateCourse"("status","title")`);
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Booking" ADD COLUMN "reservationExpiresAt" DATETIME`); } catch {}
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Booking_userId_createdAt_idx" ON "Booking"("userId","createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Booking_courtId_date_status_idx" ON "Booking"("courtId","date","status")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Booking_coachId_date_status_idx" ON "Booking"("coachId","date","status")`);
}

// Additive compatibility guard for existing local SQLite installs. The Prisma
// migration is canonical for deployments; this keeps older dev databases
// usable while the app starts.
async function ensureCentralUserIdentity(){
  const addColumnIfMissing=async(table:string,column:string,definition:string)=>{
    const cols=await prisma.$queryRawUnsafe<any[]>(`PRAGMA table_info("${table}")`);
    if(!cols.some(c=>String(c.name)===column))await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  };
  await addColumnIfMissing("User","active","BOOLEAN NOT NULL DEFAULT true");
  await addColumnIfMissing("User","lastLoginAt","DATETIME");
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Doctor" (
    "id" TEXT NOT NULL PRIMARY KEY,"userId" TEXT NOT NULL UNIQUE,
    "specialty" TEXT NOT NULL DEFAULT 'Physiotherapy & rehabilitation',"phone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',"color" TEXT NOT NULL DEFAULT '#79B4FF',"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BadmintonPackageCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,"name" TEXT NOT NULL UNIQUE,"active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BadmintonPackageCategory_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "BadmintonPackagePurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,"code" TEXT NOT NULL UNIQUE,"userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,"packageName" TEXT NOT NULL,"price" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'Pay at front desk',"status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"paidAt" DATETIME,
    CONSTRAINT "BadmintonPackagePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BadmintonPackagePurchase_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "BadmintonPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PaymentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,"reference" TEXT NOT NULL UNIQUE,"userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,"resourceId" TEXT NOT NULL,"amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MMK',"provider" TEXT NOT NULL DEFAULT 'KPay',
    "providerReference" TEXT UNIQUE,"checkoutUrl" TEXT,"qrCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIATING',"expiresAt" DATETIME NOT NULL,"paidAt" DATETIME,
    "failureReason" TEXT,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentAttempt_userId_createdAt_idx" ON "PaymentAttempt"("userId","createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentAttempt_resourceType_resourceId_idx" ON "PaymentAttempt"("resourceType","resourceId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status","expiresAt")`);
  await addColumnIfMissing("Coach","imageUrl",'TEXT');
  await addColumnIfMissing("PrivateCourse","imageUrl",'TEXT');
  await addColumnIfMissing("PrivateCourse","category",`TEXT NOT NULL DEFAULT 'Private Training'`);
  for(const [column,definition] of [["icon",'TEXT'],["imageUrl",'TEXT'],["actionLabel",'TEXT'],["entityType",'TEXT'],["entityId",'TEXT'],["activeInInbox",'BOOLEAN NOT NULL DEFAULT true']] as const)await addColumnIfMissing("Notification",column,definition);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_PrivateCourseCoaches" (
    "A" TEXT NOT NULL,"B" TEXT NOT NULL,
    CONSTRAINT "_PrivateCourseCoaches_A_fkey" FOREIGN KEY ("A") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PrivateCourseCoaches_B_fkey" FOREIGN KEY ("B") REFERENCES "PrivateCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "_PrivateCourseCoaches_AB_unique" ON "_PrivateCourseCoaches"("A","B")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "_PrivateCourseCoaches_B_idx" ON "_PrivateCourseCoaches"("B")`);
  const scheduleCols=await prisma.$queryRawUnsafe<any[]>(`PRAGMA table_info("Schedule")`);
  if(scheduleCols.some(c=>String(c.name)==="coachId")){
    await prisma.$executeRawUnsafe(`CREATE TABLE "Schedule_new" (
      "id" TEXT NOT NULL PRIMARY KEY, "person" TEXT NOT NULL, "role" TEXT NOT NULL,
      "day" TEXT NOT NULL, "start" TEXT NOT NULL, "end" TEXT NOT NULL,
      "service" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "doctorId" TEXT,
      CONSTRAINT "Schedule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe(`INSERT INTO "Schedule_new" ("id","person","role","day","start","end","service","active","doctorId")
      SELECT "id","person","role","day","start","end","service","active","doctorId" FROM "Schedule" WHERE "role"='doctor'`);
    await prisma.$executeRawUnsafe(`DROP TABLE "Schedule"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Schedule_new" RENAME TO "Schedule"`);
  }
  await addColumnIfMissing("BadmintonEnrollment","purchaseId",'TEXT REFERENCES "BadmintonPackagePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BadmintonEnrollment_purchaseId_key" ON "BadmintonEnrollment"("purchaseId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BadmintonPackagePurchase_userId_createdAt_idx" ON "BadmintonPackagePurchase"("userId","createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BadmintonPackagePurchase_status_createdAt_idx" ON "BadmintonPackagePurchase"("status","createdAt")`);
  for(const [column,definition] of [["categoryId",'TEXT REFERENCES "BadmintonPackageCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE'],["availableDays",'JSONB'],["availableFrom",'TEXT'],["availableUntil",'TEXT'],["scheduleNotes",'TEXT'],["courtRules",'TEXT'],["imageUrl",'TEXT']] as const) await addColumnIfMissing("BadmintonPackage",column,definition);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BadmintonPackage_categoryId_status_idx" ON "BadmintonPackage"("categoryId","status")`);
  await addColumnIfMissing("Coach","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Schedule","doctorId",'TEXT REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Appointment","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Appointment","doctorId",'TEXT REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Membership","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Transaction","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("StoreOrder","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Coach_userId_key" ON "Coach"("userId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "User_role_active_idx" ON "User"("role","active")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Schedule_doctorId_idx" ON "Schedule"("doctorId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Appointment_userId_date_idx" ON "Appointment"("userId","date")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Appointment_doctorId_date_idx" ON "Appointment"("doctorId","date")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership"("userId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" ON "Transaction"("userId","createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StoreOrder_userId_idx" ON "StoreOrder"("userId")`);
  await prisma.$executeRawUnsafe(`UPDATE "Coach" SET "userId"=(SELECT "id" FROM "User" WHERE lower("email")=lower("Coach"."email") AND "role"='coach' LIMIT 1) WHERE "userId" IS NULL AND EXISTS(SELECT 1 FROM "User" WHERE lower("email")=lower("Coach"."email") AND "role"='coach')`);
}

async function courtBlocks(date?: string, courtId?: string) {
  const dow = date ? new Date(`${date}T00:00:00`).getDay() : undefined;
  const where = date && courtId
    ? `WHERE (cb.date = ? OR (cb.dayOfWeek = ? AND cb.active = 1)) AND cb.courtId = ?`
    : date
      ? `WHERE (cb.date = ? OR (cb.dayOfWeek = ? AND cb.active = 1))`
      : courtId
        ? `WHERE cb.courtId = ?`
        : ``;
  const params = date && courtId ? [date, dow, courtId] : date ? [date, dow] : courtId ? [courtId] : [];
  return prisma.$queryRawUnsafe<any[]>(`SELECT cb.*, c.name as courtName FROM "CourtBlock" cb JOIN "Court" c ON c.id = cb.courtId ${where} ORDER BY cb.start ASC`, ...params);
}

async function holidayRate(date: string) {
  const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "HolidayRate" WHERE date = ? LIMIT 1`, date);
  return rows[0] || null;
}


app.get("/api/health", (_req, res) => res.json({ ok: true, service: "zawana-api", time: new Date().toISOString() }));

// Auth
app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const body = z.object({ name:z.string().min(2), email:z.string().email(), password:z.string().min(6), phone:z.string().optional() }).parse(req.body);
  const exists = await prisma.user.findUnique({ where:{ email:body.email.toLowerCase() }});
  if (exists) return res.status(409).json({ message:"Email already registered" });
  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({ data:{ name:body.name, email:body.email.toLowerCase(), passwordHash, phone:body.phone, role:"member" }});
  const safe = { id:user.id,name:user.name,email:user.email,role:user.role,membership:user.membership };
  res.status(201).json({ user:safe, token:tokenFor({...user, role:user.role}) });
}));

app.post("/api/auth/login", asyncRoute(async (req,res)=>{
  const body=z.object({email:z.string().email(),password:z.string()}).parse(req.body);
  const user=await prisma.user.findUnique({where:{email:body.email.toLowerCase()}});
  if(!user || !user.active || !(await bcrypt.compare(body.password,user.passwordHash))) return res.status(401).json({message:"Invalid email or password"});
  await prisma.user.update({where:{id:user.id},data:{lastLoginAt:new Date()}});
  res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role,membership:user.membership,avatar:user.avatar},token:tokenFor({...user,role:user.role})});
}));

app.get("/api/auth/me",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const u=await prisma.user.findUnique({where:{id:req.user!.id}});
  if(!u) return res.status(404).json({message:"User not found"});
  if(!u.active)return res.status(401).json({message:"This account is inactive. Contact an administrator."});
  res.json({id:u.id,name:u.name,email:u.email,role:u.role,membership:u.membership,avatar:u.avatar});
}));

// Users / members
app.get("/api/users",auth,roles("admin"),asyncRoute(async(_req,res)=>res.json(await prisma.user.findMany({select:{id:true,name:true,email:true,role:true,phone:true,membership:true,avatar:true,active:true,createdAt:true,lastLoginAt:true,_count:{select:{bookings:true,notifications:true,badmintonEnrollments:true,appointments:true,transactions:true}}},orderBy:{createdAt:"desc"}}))));
app.post("/api/users",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),phone:z.string().optional(),role:z.nativeEnum(Role)}).parse(req.body);
  const email=b.email.toLowerCase();
  const passwordHash=await bcrypt.hash(b.password,12);
  const created=await prisma.$transaction(async tx=>{
    const user=await tx.user.create({data:{name:b.name,email,passwordHash,phone:b.phone||null,role:b.role}});
    if(b.role==="coach")await tx.coach.create({data:{name:b.name,email,specialty:"Badminton",phone:b.phone||"",userId:user.id}});
    if(b.role==="doctor")await tx.doctor.create({data:{userId:user.id,phone:b.phone||""}});
    return user;
  });
  res.status(201).json({id:created.id,name:created.name,email:created.email,role:created.role,phone:created.phone,active:created.active,createdAt:created.createdAt});
}));
app.patch("/api/users/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const body=z.object({name:z.string().min(2).optional(),phone:z.string().nullable().optional(),role:z.nativeEnum(Role).optional(),membership:z.string().nullable().optional(),active:z.boolean().optional(),password:z.string().min(8).optional()}).parse(req.body);
  if(req.params.id===req.user!.id&&body.active===false)return res.status(400).json({message:"You cannot deactivate your own admin account."});
  const data:any={...body};if(body.password){data.passwordHash=await bcrypt.hash(body.password,12);delete data.password;}
  const updated=await prisma.$transaction(async tx=>{
    const user=await tx.user.update({where:{id:req.params.id},data,select:{id:true,name:true,email:true,role:true,phone:true,membership:true,active:true,createdAt:true,lastLoginAt:true}});
    if(user.role==="coach"){
      const existing=await tx.coach.findFirst({where:{OR:[{userId:user.id},{email:user.email}]}});
      if(existing)await tx.coach.update({where:{id:existing.id},data:{userId:user.id,name:user.name,email:user.email,phone:user.phone||"",status:user.active?"active":"inactive"}});
      else await tx.coach.create({data:{userId:user.id,name:user.name,email:user.email,phone:user.phone||"",specialty:"Badminton",status:user.active?"active":"inactive"}});
    } else if(body.role) await tx.coach.updateMany({where:{userId:user.id},data:{status:"inactive"}});
    if(user.role==="doctor"){
      const existing=await tx.doctor.findUnique({where:{userId:user.id}});
      if(existing)await tx.doctor.update({where:{userId:user.id},data:{phone:user.phone||"",status:user.active?"active":"inactive"}});
      else await tx.doctor.create({data:{userId:user.id,phone:user.phone||"",status:user.active?"active":"inactive"}});
    } else if(body.role) await tx.doctor.updateMany({where:{userId:user.id},data:{status:"inactive"}});
    return user;
  });
  res.json(updated);
}));
app.get("/api/users/:id/activity",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const user=await prisma.user.findUnique({where:{id:String(req.params.id)},include:{bookings:{include:{court:true,coach:true},orderBy:{createdAt:"desc"}},badmintonEnrollments:{include:{checkIns:{orderBy:{createdAt:"desc"}}},orderBy:{createdAt:"desc"}},appointments:{orderBy:{date:"desc"}},transactions:{orderBy:{createdAt:"desc"}},memberships:true,storeOrders:true}});
  if(!user)return res.status(404).json({message:"User not found"});
  const {passwordHash,...safe}=user;res.json(safe);
}));

// Courts
app.get("/api/courts",asyncRoute(async(_req,res)=>res.json(await prisma.court.findMany({orderBy:{name:"asc"}}))));
app.post("/api/courts",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string(),type:z.enum(["Premium","Standard"]),surface:z.string(),price:z.number().int().nonnegative(),status:z.nativeEnum(CourtStatus).optional(),features:z.array(z.string()).default([])}).parse(req.body);
  res.status(201).json(await prisma.court.create({data:{...b,status:b.status||"available",features:b.features}}));
}));
app.patch("/api/courts/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string().optional(),type:z.enum(["Premium","Standard"]).optional(),surface:z.string().optional(),price:z.number().int().nonnegative().optional(),status:z.nativeEnum(CourtStatus).optional(),features:z.array(z.string()).optional()}).parse(req.body);
  res.json(await prisma.court.update({where:{id:req.params.id},data:b}));
}));
app.delete("/api/courts/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{ await prisma.court.delete({where:{id:req.params.id}}); res.status(204).end(); }));

// Coaches
app.get("/api/coaches",auth,asyncRoute(async(req:AuthRequest,res)=>res.json(await prisma.coach.findMany({where:["admin","gym_fo"].includes(req.user!.role)?{}:{status:"active",user:{is:{active:true,role:"coach"}}},include:{user:{select:{id:true,name:true,email:true,active:true,avatar:true}}},orderBy:{name:"asc"}}))));
app.post("/api/coaches",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string(),specialty:z.string(),phone:z.string(),email:z.string().email(),status:z.enum(["active","inactive"]).optional(),color:z.string().optional()}).parse(req.body);
  const user=await prisma.user.findFirst({where:{email:b.email.toLowerCase(),role:"coach",active:true}});
  if(!user)return res.status(400).json({message:"Create or select an active Coach user account first, then link this profile to its email."});
  res.status(201).json(await prisma.coach.create({data:{...b,email:user.email,userId:user.id,status:b.status||"active",color:b.color||"#D6FF3F"}}));
}));
app.patch("/api/coaches/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string().optional(),specialty:z.string().optional(),phone:z.string().optional(),email:z.string().email().optional(),status:z.enum(["active","inactive"]).optional(),color:z.string().optional(),imageUrl:z.string().nullable().optional()}).parse(req.body);
  let data:any={...b};
  if(b.email){const user=await prisma.user.findFirst({where:{email:b.email.toLowerCase(),role:"coach",active:true}});if(!user)return res.status(400).json({message:"Select an active Coach user account email."});data.email=user.email;data.userId=user.id;}
  res.json(await prisma.coach.update({where:{id:req.params.id},data}));
}));
async function saveProfileImage(dataUrl:string,folder:string){
  const match=dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Object.assign(new Error("Upload a PNG, JPG, or WebP image."),{statusCode:400});
  const bytes=Buffer.from(match[2],"base64");if(!bytes.length||bytes.length>5*1024*1024)throw Object.assign(new Error("Profile images must be 5 MB or smaller."),{statusCode:400});
  const signatures:Record<string,boolean>={png:bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg:bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217,webp:bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP"};
  if(!signatures[match[1]])throw Object.assign(new Error("Image data did not match the selected file type."),{statusCode:400});
  const ext=match[1]==="jpeg"?"jpg":match[1],name=`${crypto.randomUUID()}.${ext}`,root=folder==="coaches"?coachUploadPath:courseUploadPath;await mkdir(root,{recursive:true});await writeFile(path.join(root,name),bytes);return `${publicApiUrl()}/uploads/${folder}/${name}`;
}
app.post("/api/coaches/:id/image",auth,roles("admin"),asyncRoute(async(req,res)=>{const b=z.object({image:z.string().min(1)}).parse(req.body);const imageUrl=await saveProfileImage(b.image,"coaches");res.json(await prisma.coach.update({where:{id:String(req.params.id)},data:{imageUrl}}));}));
app.delete("/api/coaches/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{await prisma.coach.delete({where:{id:req.params.id}});res.status(204).end()}));

// Doctors are role profiles on the central user account.
app.get("/api/doctors",auth,roles("admin","clinic_fo"),asyncRoute(async(req,res)=>res.json(await prisma.doctor.findMany({where:req.user!.role==="admin"?{}:{status:"active",user:{is:{active:true}}},include:{user:{select:{id:true,name:true,email:true,phone:true,active:true}},schedules:{where:{active:true},orderBy:[{day:"asc"},{start:"asc"}]}},orderBy:{createdAt:"asc"}}))));
app.patch("/api/doctors/:id",auth,roles("admin","clinic_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({specialty:z.string().optional(),phone:z.string().optional(),status:z.enum(["active","inactive"]).optional(),color:z.string().optional()}).parse(req.body);
  res.json(await prisma.doctor.update({where:{id:String(req.params.id)},data:b,include:{user:{select:{id:true,name:true,email:true,phone:true,active:true}}}}));
}));
app.get("/api/clinic/member-accounts",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req:AuthRequest,res)=>{
  let ids:string[]|undefined;
  if(req.user!.role==="doctor"){
    const doctor=await prisma.doctor.findUnique({where:{userId:req.user!.id}});
    if(!doctor)return res.json([]);
    const visits=await prisma.appointment.findMany({where:{doctorId:doctor.id,userId:{not:null}},select:{userId:true},distinct:["userId"]});
    ids=visits.map(v=>v.userId!).filter(Boolean);
  }
  res.json(await prisma.user.findMany({where:{role:"member",active:true,...(ids?{id:{in:ids}}:{})},select:{id:true,name:true,email:true,phone:true,createdAt:true},orderBy:{name:"asc"}}));
}));

// Schedules / coach assignment
app.get("/api/schedules",auth,asyncRoute(async(req:AuthRequest,res)=>{
  if(!["admin","clinic_fo","doctor"].includes(req.user!.role))return res.status(410).json({message:"Coach schedule management has been removed."});
  const doctor=req.user!.role==="doctor"?await prisma.doctor.findUnique({where:{userId:req.user!.id}}):null;
  const where=req.user!.role==="doctor"?{doctorId:doctor?.id||"__no_doctor__",role:"doctor" as const}:{};
  res.json(await prisma.schedule.findMany({where,include:{doctor:{include:{user:{select:{id:true,name:true}}}}},orderBy:[{day:"asc"},{start:"asc"}]}));
}));
app.post("/api/schedules",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({person:z.string(),role:z.enum(["coach","doctor"]),day:z.string(),start:z.string(),end:z.string(),service:z.string().optional(),active:z.boolean().default(true),coachId:z.string().optional(),doctorId:z.string().optional()}).parse(req.body);
  if(b.role!=="doctor")return res.status(410).json({message:"Coach schedule management has been removed."});
  const scheduleData:any={...b};
  {
    if(!b.doctorId)return res.status(400).json({message:"Select the doctor account for this availability."});
    const profile=await prisma.doctor.findUnique({where:{id:b.doctorId},include:{user:true}});
    if(!profile||profile.status!=="active"||!profile.user.active||profile.user.role!=="doctor")return res.status(400).json({message:"Select an active doctor account."});
    scheduleData.person=profile.user.name;
  }
  if(req.user!.role==="doctor"){
    const doctor=await prisma.doctor.findUnique({where:{userId:req.user!.id}});
    if(!doctor||b.role!=="doctor"||b.doctorId!==doctor.id)return res.status(403).json({message:"Doctors can only add availability to their own schedule."});
  }
  res.status(201).json(await prisma.schedule.create({data:scheduleData,include:{doctor:true}}));
}));
app.patch("/api/schedules/:id",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req:AuthRequest,res)=>{
  if(req.user!.role==="doctor"){
    const doctor=await prisma.doctor.findUnique({where:{userId:req.user!.id}}),schedule=await prisma.schedule.findUnique({where:{id:String(req.params.id)}});
    if(!doctor||!schedule||schedule.doctorId!==doctor.id)return res.status(403).json({message:"You can only update your own schedule."});
    if((req.body as any).doctorId&&((req.body as any).doctorId!==doctor.id))return res.status(403).json({message:"You cannot reassign another doctor's schedule."});
  }
  const b=z.object({person:z.string().optional(),day:z.string().optional(),start:z.string().optional(),end:z.string().optional(),service:z.string().optional(),active:z.boolean().optional(),doctorId:z.string().nullable().optional()}).parse(req.body);
  res.json(await prisma.schedule.update({where:{id:String(req.params.id)},data:b,include:{doctor:true}}));
}));
app.delete("/api/schedules/:id",auth,roles("admin","clinic_fo"),asyncRoute(async(req,res)=>{await prisma.schedule.delete({where:{id:String(req.params.id)}});res.status(204).end()}));

// Public booking availability
app.get("/api/bookings/availability",asyncRoute(async(req,res)=>{
  await expirePrivateCourseReservations();
  const date=String(req.query.date||today()); const courtId=String(req.query.courtId||"");
  const [bookings,blocks,holiday]=await Promise.all([
    prisma.booking.findMany({where:{date,status:{in:["pending","confirmed","CONFIRMED","PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"]},...(courtId?{courtId}: {})},select:{id:true,date:true,time:true,courtId:true,coachId:true,status:true}}),
    courtBlocks(date,courtId),
    holidayRate(date)
  ]);
  res.json({bookings,blocks,holiday});
}));

// Bookings
app.get("/api/bookings",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const isAdmin=["admin","gym_fo","badminton_fo","clinic_fo"].includes(req.user!.role);
  const coach=req.user!.role==="coach"?await prisma.coach.findUnique({where:{userId:req.user!.id}}):null;
  const where=isAdmin?{}:req.user!.role==="coach"?{coachId:coach?.id||"__no_coach__"}:{userId:req.user!.id};
  res.json(await prisma.booking.findMany({where,include:{court:true,coach:true,user:{select:{id:true,name:true,email:true}}},orderBy:{createdAt:"desc"}}));
}));

app.post("/api/bookings",auth,asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const b=z.object({kind:z.enum(["court","class","pt","recovery"]),title:z.string(),date:z.string(),time:z.string(),location:z.string(),price:z.number().int().nonnegative().optional(),courtId:z.string().optional(),coachId:z.string().optional(),meta:z.string().optional(),paymentStatus:z.enum(["pending","paid","refunded"]).optional()}).parse(req.body);
  const toMin=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1],mi=+m[2];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+mi};
  const range=(v:string)=>{const p=v.split(/\s*(?:—|–|-)\s*/);if(p.length!==2)return null;const a=toMin(p[0]),e=toMin(p[1]);return Number.isFinite(a)&&Number.isFinite(e)?{start:a,end:e}:null};
  const overlaps=(a:string,b:string)=>{const x=range(a),y=range(b);return !!x&&!!y&&x.start<y.end&&y.start<x.end};
  if(b.kind==="court"){
    const r=range(b.time); if(!b.courtId||!r||r.end-r.start!==60||r.start<360||r.end>1260||r.start%60!==0)return res.status(400).json({message:"Court bookings must be one hour, starting on the hour, between 6:00 AM and 9:00 PM."});
    const court=await prisma.court.findUnique({where:{id:b.courtId}}); if(!court)return res.status(404).json({message:"Court not found"}); if(court.status!=="available")return res.status(409).json({message:`${court.name} is currently ${court.status}.`});
    const [blocks,holiday]=await Promise.all([courtBlocks(b.date,b.courtId),holidayRate(b.date)]);
    // Lock the court row before checking and creating so concurrent writers on
    // SQLite cannot both pass an availability read for the same court.
    const price=holiday?.active?holiday.price:court.price+(r.start>=900?5000:0);
    const booking=await prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`UPDATE "Court" SET status=status WHERE id=?`,b.courtId);
      const existing=await tx.booking.findMany({where:{date:b.date,courtId:b.courtId,status:{in:occupyingStatuses}},select:{time:true}});
      if(existing.some(x=>overlaps(x.time,b.time)))throw Object.assign(new Error("That court/time is already booked."),{statusCode:409});
      // Weekly and exact date blocks are checked inside the same write transaction.
      if(blocks.some(x=>Number(x.active)!==0&&overlaps(`${x.start} — ${x.end}`,b.time)))throw Object.assign(new Error("That court is RESERVED for a class or facility block during this time."),{statusCode:409});
      const created=await tx.booking.create({data:{...b,price,code:code("ZW"),userId:req.user!.id,status:"CONFIRMED",paymentStatus:"pending",reservationExpiresAt:null}});
      return created;
    });
    await prisma.notification.create({data:{userId:req.user!.id,title:"Court booking confirmed",body:`${court.name} · ${b.date} · ${b.time}. Payment checkout is temporarily disabled.`,link:"/bookings",audience:"member",type:"booking",icon:"calendar",entityType:"booking",entityId:booking.id}});
    return res.status(201).json({booking});
  }
  if(b.kind!=="pt")return res.status(400).json({message:"Choose a supported booking type."});
  if(!b.coachId)return res.status(400).json({message:"Select a coach."});
  const coach=await prisma.coach.findFirst({where:{id:b.coachId,status:"active",user:{is:{active:true,role:"coach"}}}});if(!coach)return res.status(409).json({message:"This coach is unavailable."});
  const booked=await prisma.booking.findMany({where:{date:b.date,coachId:b.coachId,status:{in:occupyingStatuses}},select:{time:true}});
  const trainingMinute=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]};
  const spans=(v:string)=>{const p=v.split(/\s*(?:—|–|-|to)\s*/i);return p.length===2?[trainingMinute(p[0]),trainingMinute(p[1])]:[NaN,NaN]};const wanted=spans(b.time);if(!Number.isFinite(wanted[0])||wanted[1]<=wanted[0])return res.status(400).json({message:"Choose a valid training time."});
  if(booked.some(x=>{const r=spans(x.time);return wanted[0]<r[1]&&r[0]<wanted[1]}))return res.status(409).json({message:"That coach is already booked at this time."});
  const booking=await prisma.booking.create({data:{kind:"pt",title:b.title,date:b.date,time:b.time,location:b.location,coachId:coach.id,price:30000,code:code("PT"),userId:req.user!.id,status:"CONFIRMED",paymentStatus:"pending"}});
  res.status(201).json({booking});
}));

app.patch("/api/bookings/:id",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const existing=await prisma.booking.findUnique({where:{id:String(req.params.id)}}); if(!existing)return res.status(404).json({message:"Booking not found"});
  const staff=["admin","gym_fo","badminton_fo","coach"].includes(req.user!.role); if(!staff&&existing.userId!==req.user!.id)return res.status(403).json({message:"Not allowed"});
  if(existing.kind==="private_course")return res.status(403).json({message:"Private course status is managed through its booking workflow."});
  if(req.user!.role==="member"&&("status" in (req.body||{})||"paymentStatus" in (req.body||{})))return res.status(403).json({message:"Members cannot change booking or payment status."});
  const b=z.object({title:z.string().optional(),date:z.string().optional(),time:z.string().optional(),location:z.string().optional(),price:z.number().int().nonnegative().optional(),paymentStatus:z.enum(["pending","paid","refunded"]).optional(),status:z.nativeEnum(BookingStatus).optional()}).parse(req.body);
  if(existing.kind==="court"){const time=b.time||existing.time; const date=b.date||existing.date; const p=time.split(/\s*(?:—|–|-)\s*/); const mins=(x:string)=>{const m=x.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]}; if(p.length!==2||mins(p[1])-mins(p[0])!==60||mins(p[0])<360||mins(p[1])>1260)return res.status(400).json({message:"Court bookings must be one hour between 6:00 AM and 9:00 PM."}); const conflicts=await prisma.booking.findMany({where:{id:{not:existing.id},date,courtId:existing.courtId!,status:{in:["pending","confirmed"]}},select:{time:true}}); const overlap=(a:string)=>{const x=a.split(/\s*(?:—|–|-)\s*/);return x.length===2&&mins(x[0])<mins(p[1])&&mins(p[0])<mins(x[1])}; if(conflicts.some(x=>overlap(x.time)))return res.status(409).json({message:"That court/time is already booked."}); const blocks=await courtBlocks(date,existing.courtId!); if(blocks.some(x=>overlap(`${x.start} — ${x.end}`)))return res.status(409).json({message:"That court/time is reserved for a class."});}
  res.json(await prisma.booking.update({where:{id:existing.id},data:b}));
}));
app.delete("/api/bookings/:id",auth,asyncRoute(async(req:AuthRequest,res)=>{const existing=await prisma.booking.findUnique({where:{id:String(req.params.id)}});if(!existing)return res.status(404).json({message:"Booking not found"});const staff=["admin","gym_fo","badminton_fo"].includes(req.user!.role);if(!staff&&existing.userId!==req.user!.id)return res.status(403).json({message:"Not allowed"});await prisma.booking.delete({where:{id:existing.id}});res.status(204).end();}));

app.patch("/api/bookings/:id/status",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({status:z.nativeEnum(BookingStatus)}).parse(req.body);
  const existing=await prisma.booking.findUnique({where:{id:String(req.params.id)}});
  if(!existing) return res.status(404).json({message:"Booking not found"});
  if(!["admin","gym_fo","badminton_fo"].includes(req.user!.role)) {
    if(existing.userId!==req.user!.id||b.status!=="cancelled"||existing.kind==="private_course") return res.status(403).json({message:"Members may only cancel their own standard bookings."});
  }
  if(existing.kind==="private_course")return res.status(403).json({message:"Private course status is managed through its booking workflow."});
  res.json(await prisma.booking.update({where:{id:String(req.params.id)},data:{status:b.status}}));
}));

// Badminton court reservations / class blocks / holiday pricing
app.get("/api/court-blocks",asyncRoute(async(req,res)=>res.json(await courtBlocks(req.query.date?String(req.query.date):undefined,req.query.courtId?String(req.query.courtId):undefined))));
app.post("/api/court-blocks",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const raw=z.object({courtId:z.string(),dayOfWeek:z.coerce.number().int().min(0).max(6),start:z.string(),end:z.string(),title:z.string().min(1),type:z.string().default("class"),note:z.string().optional(),active:z.boolean().optional()}).parse(req.body); const start=normalizeTime24(raw.start), end=normalizeTime24(raw.end); if(!start||!end)return res.status(400).json({message:"Invalid time. Use 06:00–21:00 or a one-hour AM/PM slot."}); const b={...raw,start,end};
  const m=(x:string)=>{const p=x.split(":");return +p[0]*60+ +p[1]};
  if(m(b.end)-m(b.start)!==60||m(b.start)<360||m(b.end)>1260||m(b.start)%60!==0)return res.status(400).json({message:"Class reservations must be one hour between 6:00 AM and 9:00 PM."});
  const existing=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "CourtBlock" WHERE courtId=? AND dayOfWeek=? AND active=1`,b.courtId,b.dayOfWeek);
  const exact=existing.find(x=>x.start===b.start&&x.end===b.end);
  if(exact){
    return res.json((await prisma.$queryRawUnsafe<any[]>(`SELECT cb.*, c.name as courtName FROM "CourtBlock" cb JOIN "Court" c ON c.id=cb.courtId WHERE cb.id=?`,exact.id))[0]);
  }
  if(existing.some(x=>m(x.start)<m(b.end)&&m(b.start)<m(x.end)))return res.status(409).json({message:"That court already has a different weekly reservation overlapping this time."});
  const dayDates:any[]=[];
  const now=new Date();
  for(let i=0;i<7;i++){const d=new Date(now);d.setDate(now.getDate()+i);if(d.getDay()===b.dayOfWeek)dayDates.push(d.toISOString().slice(0,10));}
  if(dayDates.length){const conflicts=await prisma.booking.findMany({where:{courtId:b.courtId,date:{in:dayDates},status:{in:["pending","confirmed"]}},select:{date:true,time:true}});const range=(x:string)=>{const p=x.split(/\s*(?:—|–|-)\s*/);const parse=(v:string)=>{const q=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!q)return NaN;let h=+q[1];if(h===12)h=0;if(q[3].toUpperCase()==="PM")h+=12;return h*60+ +q[2]};return p.length===2?[parse(p[0]),parse(p[1])]:[NaN,NaN]};if(conflicts.some(x=>{const r=range(x.time);return r[0]<m(b.end)&&m(b.start)<r[1]}))return res.status(409).json({message:"A booking already exists in the selected weekly time."});}
  const id=code("CB");
  await prisma.$executeRawUnsafe(`INSERT INTO "CourtBlock" (id,courtId,date,start,end,title,type,note,dayOfWeek,active) VALUES (?,?,?,?,?,?,?,?,?,?)`,id,b.courtId,"",b.start,b.end,b.title,b.type,b.note||null,b.dayOfWeek,b.active!==false?1:0);
  res.status(201).json((await courtBlocks(undefined,b.courtId)).find((x:any)=>x.id===id));
}));
app.patch("/api/court-blocks/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({dayOfWeek:z.coerce.number().int().min(0).max(6).optional(),start:z.string().regex(/^\d{2}:\d{2}$/).optional(),end:z.string().regex(/^\d{2}:\d{2}$/).optional(),title:z.string().min(1).optional(),type:z.string().optional(),note:z.string().optional(),active:z.boolean().optional()}).parse(req.body);
  const current=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "CourtBlock" WHERE id=?`,req.params.id))[0];if(!current)return res.status(404).json({message:"Court block not found"});
  const day=b.dayOfWeek??current.dayOfWeek,startTime=b.start??current.start,endTime=b.end??current.end;const m=(x:string)=>{const p=x.split(":");return +p[0]*60+ +p[1]};if(m(endTime)-m(startTime)!==60||m(startTime)<360||m(endTime)>1260)return res.status(400).json({message:"Class reservations must be one hour between 6:00 AM and 9:00 PM."});
  const sets:string[]=[];const vals:any[]=[];for(const [k,v] of Object.entries({...b,dayOfWeek:day,start:startTime,end:endTime})){if(v!==undefined){sets.push(`"${k}" = ?`);vals.push(v)}}if(!sets.length)return res.status(400).json({message:"No changes supplied"});vals.push(req.params.id);await prisma.$executeRawUnsafe(`UPDATE "CourtBlock" SET ${sets.join(", ")} WHERE id = ?`,...vals);res.json((await prisma.$queryRawUnsafe<any[]>(`SELECT cb.*, c.name as courtName FROM "CourtBlock" cb JOIN "Court" c ON c.id=cb.courtId WHERE cb.id=?`,req.params.id))[0]);
}));
app.delete("/api/court-blocks/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT id FROM "CourtBlock" WHERE id=?`,req.params.id);if(!rows[0])return res.status(404).json({message:"Court block not found"});await prisma.$executeRawUnsafe(`DELETE FROM "CourtBlock" WHERE id = ?`,req.params.id);res.status(204).end()}));

app.get("/api/dashboard",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const [members,bookingsToday,revenue,activeCourts,coaches]=await Promise.all([
    prisma.user.count({where:{role:"member"}}),
    prisma.booking.count({where:{date:today(),status:{in:["pending","confirmed"]}}}),
    prisma.transaction.aggregate({where:{status:"paid"},_sum:{finalAmount:true}}),
    prisma.court.count({where:{status:"available"}}),
    prisma.coach.count({where:{status:"active"}})
  ]);
  res.json({members,bookingsToday,revenue:revenue._sum.finalAmount||0,activeCourts,coaches});
}));

// Packages
app.get("/api/packages/badminton",auth,asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackage.findMany({where:req.user?.role==="admin"||req.user?.role==="badminton_fo"?{}:{status:"active"},include:{category:true},orderBy:{title:"asc"}}))));
app.get("/api/packages/badminton/categories",auth,asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackageCategory.findMany({where:req.user?.role==="admin"||req.user?.role==="badminton_fo"?{}:{active:true},orderBy:{name:"asc"}}))));
app.post("/api/packages/badminton/categories",auth,roles("admin"),asyncRoute(async(req:AuthRequest,res)=>{const name=String(req.body.name||"").trim();if(!name)return res.status(400).json({message:"Category name is required."});res.status(201).json(await prisma.badmintonPackageCategory.create({data:{name,createdBy:req.user!.id}}))}));
app.patch("/api/packages/badminton/categories/:id",auth,roles("admin"),asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackageCategory.update({where:{id:req.params.id},data:{name:req.body.name,active:req.body.active}}))));
app.post("/api/packages/badminton",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.badmintonPackage.create({data:req.body}))));
app.patch("/api/packages/badminton/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackage.update({where:{id:req.params.id},data:req.body}))));
app.delete("/api/packages/badminton/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{await prisma.badmintonPackage.delete({where:{id:req.params.id}});res.status(204).end()}));
app.get("/api/packages/gym",auth,asyncRoute(async(_req,res)=>res.json(await prisma.gymPackage.findMany({orderBy:{title:"asc"}}))));
app.post("/api/packages/gym",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.gymPackage.create({data:{...req.body,benefits:req.body.benefits||[]}}))));
app.patch("/api/packages/gym/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>res.json(await prisma.gymPackage.update({where:{id:req.params.id},data:{...req.body,benefits:req.body.benefits||undefined}}))));
app.delete("/api/packages/gym/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{await prisma.gymPackage.delete({where:{id:req.params.id}});res.status(204).end()}));

// Memberships
app.get("/api/memberships",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const where=["admin","gym_fo"].includes(req.user!.role)?{}:req.user!.role==="member"?{userId:req.user!.id}:null;
  if(!where)return res.status(403).json({message:"Insufficient permissions"});
  res.json(await prisma.membership.findMany({where,orderBy:{expiryDate:"asc"}}));
}));
app.post("/api/memberships",auth,roles("admin","gym_fo"),asyncRoute(async(_req,res)=>res.status(410).json({message:"Memberships can only be activated by verified KPay payment."})));

// Badminton package ownership + check-in
function addDaysIso(start:string, days:number){ const d=new Date(`${start}T00:00:00`); d.setDate(d.getDate()+Math.max(0,days-1)); return d.toISOString().slice(0,10); }
async function refreshEnrollmentStatus(enrollment:any){
  if(enrollment.status !== "expired" && enrollment.expiryDate < today()) {
    await prisma.$executeRawUnsafe(`UPDATE "BadmintonEnrollment" SET status='expired' WHERE id=?`, enrollment.id);
    enrollment.status='expired';
  }
  return enrollment;
}
app.get("/api/badminton/enrollments",auth,roles("admin","badminton_fo"),asyncRoute(async(_req,res)=>{
  const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonEnrollment" ORDER BY status ASC, expiryDate ASC, studentName ASC`);
  for(const row of rows) await refreshEnrollmentStatus(row);
  res.json(rows);
}));
app.get("/api/badminton/member-accounts",auth,roles("admin","badminton_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.user.findMany({where:{role:"member",active:true},select:{id:true,name:true,email:true,phone:true},orderBy:{name:"asc"}}))));
app.post("/api/badminton/enrollments",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  return res.status(410).json({message:"Package activation is available only after verified KPay payment."});
  /* const b=z.object({userId:z.string().min(1),packageId:z.string().min(1),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"startDate must be YYYY-MM-DD"),paymentMethod:z.string().min(1).default("Cash")}).parse(req.body);
  const member=await prisma.user.findFirst({where:{id:b.userId,role:"member",active:true}});
  if(!member)return res.status(400).json({message:"Select an active member account."});
  const pkg=await prisma.badmintonPackage.findUnique({where:{id:b.packageId}});
  if(!pkg || pkg.status!=="active") return res.status(400).json({message:"Active badminton package not found"});
  const id=code("BM"); const expiry=addDaysIso(b.startDate,pkg.validity);
  const row=(await prisma.$queryRawUnsafe<any[]>(`INSERT INTO "BadmintonEnrollment" (id,studentId,userId,studentName,phone,packageId,packageName,sessionsTotal,sessionsRemaining,startDate,expiryDate,status,renewalCount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,id,member.id,member.id,member.name,member.phone||"",pkg.id,pkg.title,pkg.sessions,pkg.sessions,b.startDate,expiry,"active",0))[0];
  await prisma.transaction.create({data:{userId:member.id,date:b.startDate,customer:member.name,business:"Badminton",item:`Package · ${pkg.title}`,amount:pkg.price,discount:0,tax:0,finalAmount:pkg.price,paymentMethod:b.paymentMethod,staff:(req as AuthRequest).user?.name||"Badminton FO",status:"paid"}});
  res.status(201).json(row); */
}));
app.post("/api/member/badminton-packages/:id/purchase",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const pkg=await prisma.badmintonPackage.findFirst({where:{id:String(req.params.id),status:"active"}});
  if(!pkg)return res.status(404).json({message:"This badminton package is no longer available."});
  const user=await prisma.user.findUnique({where:{id:req.user!.id}});if(!user)return res.status(404).json({message:"Member account not found."});
  const start=today(),expiry=addDaysIso(start,pkg.validity);
  const result=await prisma.$transaction(async tx=>{
    const purchase=await tx.badmintonPackagePurchase.create({data:{code:code("BP"),userId:user.id,packageId:pkg.id,packageName:pkg.title,price:pkg.price,paymentMethod:"Temporarily disabled",status:"ACTIVE"}});
    const enrollment=await tx.badmintonEnrollment.create({data:{studentId:user.id,userId:user.id,studentName:user.name,phone:user.phone||"",packageId:pkg.id,packageName:pkg.title,sessionsTotal:pkg.sessions,sessionsRemaining:pkg.sessions,startDate:start,expiryDate:expiry,status:"active",renewalCount:0,purchaseId:purchase.id}});
    await tx.user.update({where:{id:user.id},data:{membership:pkg.title}});
    await tx.notification.create({data:{userId:user.id,title:"Badminton package activated",body:`${pkg.title} is active with ${pkg.sessions} sessions through ${expiry}. Payment checkout is temporarily disabled.`,link:"/membership",audience:"member",type:"package",icon:"package",entityType:"package",entityId:pkg.id}});
    return {purchase,enrollment};
  });
  res.status(201).json(result);
}));
app.post("/api/cafe/orders",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({floor:z.enum(["Ground Floor","First Floor","Outdoor"]),items:z.array(z.object({id:z.string(),quantity:z.number().int().min(1).max(20)})).min(1).max(30)}).parse(req.body);
  const menu=await prisma.cafeMenuItem.findMany({where:{id:{in:b.items.map(x=>x.id)},available:true}});if(menu.length!==new Set(b.items.map(x=>x.id)).size)return res.status(400).json({message:"One or more menu items are unavailable."});
  const amount=b.items.reduce((sum,line)=>sum+(menu.find(item=>item.id===line.id)?.price||0)*line.quantity,0);if(amount<=0)return res.status(400).json({message:"Order total is invalid."});
  const items=b.items.map(line=>{const item=menu.find(m=>m.id===line.id)!;return {id:item.id,name:item.name,price:item.price,quantity:line.quantity}});
  const order=await prisma.cafeOrder.create({data:{customer:req.user!.name,items,floor:b.floor,orderTime:new Date().toISOString(),paymentMethod:"Temporarily disabled",status:"confirmed"}});
  await prisma.notification.create({data:{userId:req.user!.id,title:"Cafe order confirmed",body:`Your order for ${amount.toLocaleString()} MMK is confirmed. Payment checkout is temporarily disabled.`,link:"/cafe",audience:"member",type:"booking",entityType:"cafe_order",entityId:order.id}});
  res.status(201).json({order});
}));
app.get("/api/member/badminton-package-purchases",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>res.json(await prisma.badmintonPackagePurchase.findMany({where:{userId:req.user!.id},include:{package:true},orderBy:{createdAt:"desc"}}))));
app.get("/api/badminton/package-purchases",auth,roles("admin","badminton_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.badmintonPackagePurchase.findMany({where:{status:"AWAITING_PAYMENT"},include:{user:{select:{id:true,name:true,email:true,phone:true}},package:true},orderBy:{createdAt:"asc"}}))));
app.post("/api/badminton/package-purchases/:id/settle",auth,roles("admin","badminton_fo"),asyncRoute(async(req:AuthRequest,res)=>{
  return res.status(410).json({message:"Manual package settlement has been removed. Package activation follows verified KPay payment."});
  /* const b=z.object({paymentMethod:z.literal("KPay")}).parse(req.body);
  const result=await prisma.$transaction(async tx=>{
    const purchase=await tx.badmintonPackagePurchase.findUnique({where:{id:String(req.params.id)},include:{user:true,package:true}});
    if(!purchase)return null;
    if(purchase.status!=="AWAITING_PAYMENT")throw Object.assign(new Error("This package request has already been processed."),{statusCode:409});
    const changed=await tx.badmintonPackagePurchase.updateMany({where:{id:purchase.id,status:"AWAITING_PAYMENT"},data:{status:"PAID",paymentMethod:b.paymentMethod,paidAt:new Date()}});
    if(!changed.count)throw Object.assign(new Error("This package request has already been processed."),{statusCode:409});
    const start=today(),expiry=addDaysIso(start,purchase.package.validity),enrollmentId=code("BM");
    const enrollment=(await tx.$queryRawUnsafe<any[]>(`INSERT INTO "BadmintonEnrollment" (id,studentId,userId,studentName,phone,packageId,packageName,sessionsTotal,sessionsRemaining,startDate,expiryDate,status,renewalCount,purchaseId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,enrollmentId,purchase.userId,purchase.userId,purchase.user.name,purchase.user.phone||"",purchase.packageId,purchase.packageName,purchase.package.sessions,purchase.package.sessions,start,expiry,"active",0,purchase.id))[0];
    await tx.transaction.create({data:{userId:purchase.userId,date:start,customer:purchase.user.name,business:"Badminton",item:`Package · ${purchase.packageName}`,amount:purchase.price,discount:0,tax:0,finalAmount:purchase.price,paymentMethod:b.paymentMethod,staff:req.user!.name,status:"paid"}});
    await tx.notification.create({data:{userId:purchase.userId,title:"Badminton package activated",body:`Payment received for ${purchase.packageName}. Your sessions are ready to use.`,link:"/membership",audience:"member",type:"payment"}});
    return enrollment;
  });
  if(!result)return res.status(404).json({message:"Package request not found."});
  res.json(result); */
}));
app.post("/api/badminton/enrollments/:id/renew",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  return res.status(410).json({message:"Package renewals must use the member KPay purchase flow."});
}));
app.get("/api/badminton/enrollments/:id/check-ins",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>res.json(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonCheckIn" WHERE enrollmentId=? ORDER BY date DESC,time DESC`,req.params.id))));
app.post("/api/badminton/check-ins",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({enrollmentId:z.string().min(1),note:z.string().optional()}).parse(req.body);
  const current=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonEnrollment" WHERE id=?`,b.enrollmentId))[0];
  if(!current) return res.status(404).json({message:"Student package not found"});
  if(current.status !== "expired" && current.expiryDate < today()) { await prisma.$executeRawUnsafe(`UPDATE "BadmintonEnrollment" SET status='expired' WHERE id=?`,b.enrollmentId); current.status='expired'; }
  if(current.status !== "active") return res.status(409).json({code:"PACKAGE_EXPIRED",message:"This student's package has expired. Renew the package before check-in."});
  if(Number(current.sessionsRemaining)<=0) return res.status(409).json({code:"NO_SESSIONS",message:"This student has no sessions remaining. Renew the package before check-in."});
  const now=new Date(); const time=now.toTimeString().slice(0,5); const id=code("CHK");
  const result=await prisma.$transaction(async(tx)=>{
    const updated=(await tx.$queryRawUnsafe<any[]>(`UPDATE "BadmintonEnrollment" SET sessionsRemaining=sessionsRemaining-1,lastCheckIn=? WHERE id=? AND status='active' AND sessionsRemaining>0 RETURNING *`,`${today()} ${time}`,b.enrollmentId))[0];
    if(!updated) throw Object.assign(new Error("Package is no longer available"),{statusCode:409});
    const check=(await tx.$queryRawUnsafe<any[]>(`INSERT INTO "BadmintonCheckIn" (id,enrollmentId,date,time,sessionsUsed,staffId,note) VALUES (?,?,?,?,?,?,?) RETURNING *`,id,b.enrollmentId,today(),time,1,(req as AuthRequest).user?.id||null,b.note||null))[0];
    return {enrollment:updated,checkIn:check,warning:Number(updated.sessionsRemaining)<=2};
  });
  res.status(201).json(result);
}));
// Appointments are linked to central member and doctor accounts. Professional
// accounts can only see and update their own appointments.
app.get("/api/appointments",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const where:any={};
  if(req.user!.role==="doctor"){
    const doctor=await prisma.doctor.findUnique({where:{userId:req.user!.id}});
    where.doctorId=doctor?.id||"__no_doctor__";
  } else if(req.user!.role==="member") where.userId=req.user!.id;
  else if(!["admin","clinic_fo"].includes(req.user!.role))return res.status(403).json({message:"Insufficient permissions"});
  res.json(await prisma.appointment.findMany({where,include:{user:{select:{id:true,name:true,email:true,phone:true}},doctorProfile:{include:{user:{select:{id:true,name:true,email:true}}}},},orderBy:[{date:"asc"},{time:"asc"}]}));
}));
app.post("/api/appointments",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({userId:z.string().min(1),doctorId:z.string().optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string(),type:z.string().min(2),notes:z.string().optional(),paymentStatus:z.enum(["pending","paid","refunded"]).optional(),status:z.enum(["pending","confirmed","checked_in","completed","cancelled"]).optional()}).parse(req.body);
  let doctorId=b.doctorId,userId=b.userId;
  if(req.user!.role==="doctor"){
    const own=await prisma.doctor.findUnique({where:{userId:req.user!.id},include:{user:true}});
    if(!own)return res.status(403).json({message:"Doctor profile is not configured."});
    doctorId=own.id;
  }
  if(!doctorId)return res.status(400).json({message:"Select a doctor account."});
  const doctorProfile=await prisma.doctor.findUnique({where:{id:doctorId},include:{user:true}});
  if(!doctorProfile||doctorProfile.status!=="active"||!doctorProfile.user.active)return res.status(400).json({message:"Selected doctor is unavailable."});
  const member=await prisma.user.findUnique({where:{id:userId},select:{id:true,name:true,role:true,active:true}});if(!member||member.role!=="member"||!member.active)return res.status(400).json({message:"Select an active member account."});
  if(b.date<today())return res.status(400).json({message:"Choose a future appointment date."});
  const minOf=(v:string)=>{const m=v.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);if(!m)return NaN;let h=+m[1];if(m[3]){if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12}return h*60+ +m[2]};
  const start=minOf(b.time);if(!Number.isFinite(start)||start%30!==0||start<360||start+60>1260)return res.status(400).json({message:"Choose a valid one-hour appointment between 6:00 AM and 9:00 PM."});
  const day=new Date(`${b.date}T00:00:00`).toLocaleDateString("en-US",{weekday:"long"});
  const schedule=await prisma.schedule.findMany({where:{doctorId,role:"doctor",day,active:true}});
  if(!schedule.some(s=>{const from=minOf(s.start),to=minOf(s.end);return Number.isFinite(from)&&Number.isFinite(to)&&start>=from&&start+60<=to}))return res.status(409).json({message:"This doctor is not scheduled at the selected time."});
  const result=await prisma.$transaction(async tx=>{
    await tx.$executeRawUnsafe(`UPDATE "Doctor" SET status=status WHERE id=?`,doctorId);
    const conflicts=await tx.appointment.findMany({where:{doctorId,date:b.date,status:{notIn:["cancelled"]}},select:{time:true}});
    if(conflicts.some(a=>{const other=minOf(a.time);return Number.isFinite(other)&&start<other+60&&other<start+60}))throw Object.assign(new Error("That doctor already has an appointment at this time."),{statusCode:409});
    return tx.appointment.create({data:{userId,doctorId,doctor:doctorProfile.user.name,patient:member.name,date:b.date,time:b.time,type:b.type,notes:b.notes,status:b.status||"pending",paymentStatus:b.paymentStatus||"pending"},include:{user:{select:{id:true,name:true,email:true}},doctorProfile:{include:{user:{select:{id:true,name:true,email:true}}}}}});
  });
  res.status(201).json(result);
}));
app.patch("/api/appointments/:id/status",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({status:z.enum(["pending","confirmed","checked_in","completed","cancelled"])}).parse(req.body);
  const appointment=await prisma.appointment.findUnique({where:{id:String(req.params.id)}});
  if(!appointment)return res.status(404).json({message:"Appointment not found."});
  if(req.user!.role==="doctor"){
    const doctor=await prisma.doctor.findUnique({where:{userId:req.user!.id}});
    if(!doctor||appointment.doctorId!==doctor.id)return res.status(403).json({message:"You can only update your own appointments."});
  }
  res.json(await prisma.appointment.update({where:{id:appointment.id},data:{status:b.status}}));
}));

// Products / inventory / orders
// Use explicit SQL for the legacy Product/Inventory tables. This keeps older
// SQLite databases compatible while the Store/POS schema is being upgraded.
const productInput = z.object({
  name: z.string().min(1),
  price: z.coerce.number().int().nonnegative(),
  category: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  description: z.string().default(""),
  sku: z.string().min(1),
  barcode: z.string().min(1),
  stock: z.coerce.number().int().nonnegative().default(0),
  cost: z.coerce.number().int().nonnegative().default(0),
  tax: z.coerce.number().int().nonnegative().default(0),
  status: z.enum(["active", "inactive"]).default("active")
});

async function productRows(where = "", ...params: any[]) {
  return prisma.$queryRawUnsafe<any[]>(`SELECT p.id,p.name,p.price,p.category,p.description,p.sku,p.barcode,p.stock,p.cost,p.tax,p.status,
    ${"categoryId"} AS categoryId
    FROM "Product" p ${where} ORDER BY p.name ASC`, ...params);
}

app.get("/api/products", asyncRoute(async (_req, res) => {
  res.json(await productRows());
}));

app.post("/api/products", auth, roles("admin", "store_fo"), asyncRoute(async (req, res) => {
  const b = productInput.parse(req.body);
  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Product" (id,name,price,category,description,sku,barcode,stock,cost,tax,status,categoryId)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,b.name,b.price,b.category,b.description,b.sku,b.barcode,b.stock,b.cost,b.tax,b.status,b.categoryId ?? null
  );
  const rows = await productRows(`WHERE p.id = ?`, id);
  res.status(201).json(rows[0]);
}));

app.patch("/api/products/:id", auth, roles("admin", "store_fo"), asyncRoute(async (req, res) => {
  const b = productInput.partial().parse(req.body);
  const id = String(req.params.id);
  const fields: string[] = [];
  const values: any[] = [];
  const map: Record<string,string> = {name:"name",price:"price",category:"category",categoryId:"categoryId",description:"description",sku:"sku",barcode:"barcode",stock:"stock",cost:"cost",tax:"tax",status:"status"};
  for (const [key,col] of Object.entries(map)) if (key in b) { fields.push(`"${col}" = ?`); values.push((b as any)[key] ?? null); }
  if (!fields.length) return res.status(400).json({message:"No fields to update"});
  values.push(id);
  await prisma.$executeRawUnsafe(`UPDATE "Product" SET ${fields.join(", ")} WHERE id = ?`, ...values);
  const rows = await productRows(`WHERE p.id = ?`, id);
  if (!rows[0]) return res.status(404).json({message:"Product not found"});
  res.json(rows[0]);
}));

app.post("/api/products/:id/stock", auth, roles("admin", "store_fo"), asyncRoute(async (req, res) => {
  const b = z.object({quantity:z.number().int(),note:z.string().default("")}).parse(req.body);
  const id = String(req.params.id);
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRawUnsafe<any[]>(`SELECT id FROM "Product" WHERE id = ?`, id);
    if (!rows[0]) throw Object.assign(new Error("Product not found"), { statusCode: 404 });
    await tx.$executeRawUnsafe(`UPDATE "Product" SET stock = stock + ? WHERE id = ?`, b.quantity, id);
    await tx.$executeRawUnsafe(`INSERT INTO "InventoryTransaction" (id,productId,type,quantity,note,date) VALUES (?,?,?,?,?,?)`,
      crypto.randomUUID(), id, b.quantity >= 0 ? "add" : "remove", Math.abs(b.quantity), b.note, today());
  });
  const rows = await productRows(`WHERE p.id = ?`, id);
  res.json(rows[0]);
}));

app.get("/api/inventory", auth, roles("admin", "store_fo"), asyncRoute(async (_req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT i.id,i.productId,i.type,i.quantity,i.note,i.date,
    p.id as product_id,p.name as product_name,p.price as product_price,p.category as product_category,
    p.description as product_description,p.sku as product_sku,p.barcode as product_barcode,p.stock as product_stock,
    p.cost as product_cost,p.tax as product_tax,p.status as product_status,
    p.categoryId as product_categoryId
    FROM "InventoryTransaction" i JOIN "Product" p ON p.id=i.productId ORDER BY i.date DESC`);
  res.json(rows.map(r => ({
    id:r.id, productId:r.productId, type:r.type, quantity:r.quantity, note:r.note, date:r.date,
    product:{id:r.product_id,name:r.product_name,price:r.product_price,category:r.product_category,description:r.product_description,
      sku:r.product_sku,barcode:r.product_barcode,stock:r.product_stock,cost:r.product_cost,tax:r.product_tax,status:r.product_status,categoryId:r.product_categoryId}
  })));
}));

app.delete("/api/products/:id", auth, roles("admin", "store_fo"), asyncRoute(async (req,res) => {
  const result = await prisma.$executeRawUnsafe(`DELETE FROM "Product" WHERE id = ?`, String(req.params.id));
  if (!result) return res.status(404).json({message:"Product not found"});
  res.status(204).end();
}));

// Cafe
app.get("/api/cafe/orders",auth,asyncRoute(async(_req,res)=>res.json(await prisma.cafeOrder.findMany({orderBy:{id:"desc"}}))));
app.post("/api/cafe/orders",auth,asyncRoute(async(req,res)=>res.status(201).json(await prisma.cafeOrder.create({data:req.body}))));
app.patch("/api/cafe/orders/:id/status",auth,roles("admin","cafe_fo"),asyncRoute(async(req,res)=>res.json(await prisma.cafeOrder.update({where:{id:req.params.id},data:{status:req.body.status}}))));

// Legacy student snapshots remain readable to admins for migration review, but
// new identity and package ownership must use User accounts.
app.get("/api/students",auth,roles("admin"),asyncRoute(async(_req,res)=>res.json(await prisma.student.findMany({orderBy:{name:"asc"}}))));
app.post("/api/students",auth,roles("admin"),asyncRoute(async(_req,res)=>res.status(410).json({message:"Student registration is retired. Create a member account in Users instead."})));
app.patch("/api/students/:id",auth,roles("admin"),asyncRoute(async(_req,res)=>res.status(410).json({message:"Student identity records are retired. Manage the central account in Users."})));
app.delete("/api/students/:id",auth,roles("admin"),asyncRoute(async(_req,res)=>res.status(410).json({message:"Legacy student snapshots are retained for historical records."})));

// Transactions
app.get("/api/transactions",auth,asyncRoute(async(req:AuthRequest,res)=>{
  if(req.user!.role==="member")return res.json(await prisma.transaction.findMany({where:{userId:req.user!.id},orderBy:{createdAt:"desc"}}));
  if(!["admin","gym_fo","badminton_fo","clinic_fo","store_fo","cafe_fo"].includes(req.user!.role))return res.status(403).json({message:"Insufficient permissions"});
  res.json(await prisma.transaction.findMany({orderBy:{createdAt:"desc"}}));
}));
app.post("/api/transactions",auth,roles("admin","gym_fo","badminton_fo","clinic_fo","store_fo","cafe_fo"),asyncRoute(async(req:AuthRequest,res)=>{
  res.status(410).json({message:"Transactions are recorded only after verified KPay payment. Manual paid transactions are disabled."});
}));

// Content
app.get("/api/content",asyncRoute(async(_req,res)=>res.json(await prisma.contentItem.findMany({orderBy:{publishDate:"desc"}}))));
app.post("/api/content",auth,roles("admin"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.contentItem.create({data:req.body}))));
app.patch("/api/content/:id",auth,roles("admin"),asyncRoute(async(req,res)=>res.json(await prisma.contentItem.update({where:{id:req.params.id},data:req.body}))));
app.delete("/api/content/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{await prisma.contentItem.delete({where:{id:req.params.id}});res.status(204).end()}));
app.patch("/api/content/:id/publish",auth,roles("admin"),asyncRoute(async(req,res)=>res.json(await prisma.contentItem.update({where:{id:req.params.id},data:{status:"published",publishDate:today()}}))));

// Member badminton dashboard and private course workflow. Private-course requests
// share Booking rows with court rentals so the same court calendar stays authoritative.
const occupyingStatuses = ["pending", "confirmed", "CONFIRMED", "PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT"] as any;
app.get("/api/member/dashboard",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const [bookings,packages,notifications,enrollments,purchases]=await Promise.all([
    prisma.booking.findMany({where:{userId:req.user!.id},include:{court:true,coach:true},orderBy:{createdAt:"desc"}}),
    prisma.badmintonPackage.findMany({where:{status:"active"},include:{category:true},orderBy:{title:"asc"}}),
    prisma.notification.findMany({where:{userId:req.user!.id,read:false},orderBy:{createdAt:"desc"},take:6}),
    prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonEnrollment" WHERE userId=? OR studentId=? ORDER BY createdAt DESC`,req.user!.id,req.user!.id),
    prisma.badmintonPackagePurchase.findMany({where:{userId:req.user!.id},orderBy:{createdAt:"desc"}})
  ]);
  const active=enrollments.find(e=>e.status==="active"&&e.expiryDate>=today()&&Number(e.sessionsRemaining)>0)||null;
  const checkIns=active?await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonCheckIn" WHERE enrollmentId=? ORDER BY date DESC,time DESC LIMIT 12`,active.id):[];
  res.json({bookings,packages,notifications,enrollment:active,enrollmentHistory:enrollments,checkIns,purchases});
}));
app.post("/api/member/check-in",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const current=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonEnrollment" WHERE id=? AND (userId=? OR studentId=?)`,String(req.body.enrollmentId||""),req.user!.id,req.user!.id))[0];
  if(!current)return res.status(404).json({message:"No badminton package was found for your account."});
  if(current.expiryDate<today()||current.status!=="active")return res.status(409).json({message:"This badminton package has expired."});
  if(Number(current.sessionsRemaining)<=0)return res.status(409).json({message:"No sessions remain on this package."});
  const date=today(),time=new Date().toTimeString().slice(0,5),id=code("CHK");
  try {
    const result=await prisma.$transaction(async tx=>{
      const updated=(await tx.$queryRawUnsafe<any[]>("UPDATE \"BadmintonEnrollment\" SET sessionsRemaining=sessionsRemaining-1,lastCheckIn=? WHERE id=? AND (userId=? OR studentId=?) AND status='active' AND expiryDate>=? AND sessionsRemaining>0 AND NOT EXISTS (SELECT 1 FROM \"BadmintonCheckIn\" WHERE enrollmentId=? AND date=?) RETURNING *",`${date} ${time}`,current.id,req.user!.id,req.user!.id,date,current.id,date))[0];
      if(!updated){
        const already=await tx.$queryRawUnsafe<any[]>(`SELECT id FROM "BadmintonCheckIn" WHERE enrollmentId=? AND date=? LIMIT 1`,current.id,date);
        throw Object.assign(new Error(already.length?"You have already checked in today.":"This package can no longer be used."),{statusCode:409});
      }
      const checkIn=(await tx.$queryRawUnsafe<any[]>(`INSERT INTO "BadmintonCheckIn" (id,enrollmentId,date,time,sessionsUsed,note) VALUES (?,?,?,?,1,'Member self check-in') RETURNING *`,id,current.id,date,time))[0];
      return {enrollment:updated,checkIn};
    });
    res.status(201).json(result);
  } catch(error:any) { if(error.statusCode===409)return res.status(409).json({message:error.message}); throw error; }
}));
app.get("/api/private-courses",asyncRoute(async(req:AuthRequest,res)=>res.json(await prisma.privateCourse.findMany({where:req.user?.role==="admin"?{}:{status:"active"},include:{coaches:{include:{user:{select:{id:true,name:true,avatar:true,active:true}}}}},orderBy:{title:"asc"}}))));
app.post("/api/private-courses",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({title:z.string().min(3),description:z.string().default(""),duration:z.number().int().min(30).max(180).default(60),price:z.number().int().nonnegative(),status:z.enum(["active","inactive"]).default("active"),category:z.string().default("Private Training"),coachIds:z.array(z.string()).min(1).default([])}).parse(req.body);
  if(!b.coachIds.length)return res.status(400).json({message:"Assign at least one active coach to this private course."});
  const coaches=await prisma.coach.findMany({where:{id:{in:b.coachIds},status:"active",specialty:{contains:"Badminton"},user:{is:{active:true,role:"coach"}}}});if(coaches.length!==b.coachIds.length)return res.status(400).json({message:"Courses can only be assigned to active linked badminton coach profiles."});
  const {coachIds,...data}=b;res.status(201).json(await prisma.privateCourse.create({data:{...data,coaches:{connect:coachIds.map(id=>({id}))},...(req.body.imageUrl?{imageUrl:String(req.body.imageUrl)}:{})},include:{coaches:{include:{user:{select:{id:true,name:true,avatar:true,active:true}}}}}}));
}));
app.post("/api/private-courses/:id/image",auth,roles("admin"),asyncRoute(async(req,res)=>{const b=z.object({image:z.string().min(1)}).parse(req.body);const imageUrl=await saveProfileImage(b.image,"courses");res.json(await prisma.privateCourse.update({where:{id:String(req.params.id)},data:{imageUrl}}));}));
app.patch("/api/private-courses/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({title:z.string().min(3).optional(),description:z.string().optional(),duration:z.number().int().min(30).max(180).optional(),price:z.number().int().nonnegative().optional(),status:z.enum(["active","inactive"]).optional(),category:z.string().optional(),coachIds:z.array(z.string()).min(1).optional(),imageUrl:z.string().nullable().optional()}).parse(req.body);
  const {coachIds,...data}=b;if(coachIds){if(!coachIds.length)return res.status(400).json({message:"Assign at least one active coach to this private course."});const coaches=await prisma.coach.findMany({where:{id:{in:coachIds},status:"active",specialty:{contains:"Badminton"},user:{is:{active:true,role:"coach"}}}});if(coaches.length!==coachIds.length)return res.status(400).json({message:"Courses can only be assigned to active linked badminton coach profiles."});}
  res.json(await prisma.privateCourse.update({where:{id:String(req.params.id)},data:{...data,...(coachIds?{coaches:{set:coachIds.map(id=>({id}))}}:{})},include:{coaches:{include:{user:{select:{id:true,name:true,avatar:true,active:true}}}}}}));
}));
app.delete("/api/private-courses/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{const id=String(req.params.id);const count=await prisma.booking.count({where:{kind:"private_course",meta:{contains:id}}});if(count)await prisma.privateCourse.update({where:{id},data:{status:"inactive"}});else await prisma.privateCourse.delete({where:{id}});res.status(count?200:204).json(count?{status:"inactive",preservedHistory:true}:undefined)}));
app.get("/api/member/private-courses",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>res.json(await prisma.booking.findMany({where:{userId:req.user!.id,kind:"private_course"},include:{court:true,coach:true},orderBy:{createdAt:"desc"}}))));
app.get("/api/member/private-course-coaches",auth,roles("member"),asyncRoute(async(_req,res)=>{
  res.json(await prisma.coach.findMany({where:{status:"active",specialty:{contains:"Badminton"},user:{is:{role:"coach",active:true}}},include:{user:{select:{id:true,name:true,email:true,avatar:true,active:true}}},orderBy:{name:"asc"}}));
}));
app.post("/api/member/private-courses",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const b=z.object({courseId:z.string(),courtId:z.string(),coachId:z.string(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string()}).parse(req.body);
  if(b.date<today())return res.status(400).json({message:"Choose a future date."});
  const course=await prisma.privateCourse.findFirst({where:{id:b.courseId,status:"active"},include:{coaches:{select:{id:true}}}});
  if(!course)return res.status(404).json({message:"That course is no longer available."});
  if(!course.coaches.length)return res.status(409).json({message:"This private course does not have any active badminton coaches assigned yet."});
  const court=await prisma.court.findUnique({where:{id:b.courtId}}),coach=await prisma.coach.findUnique({where:{id:b.coachId, status:"active"},include:{user:true}});
  if(!court||court.status!=="available")return res.status(409).json({message:"That court is unavailable."});
  if(!coach)return res.status(409).json({message:"That coach is unavailable."});
  if(!course.coaches.some(item=>item.id===coach.id))return res.status(400).json({message:"Choose a coach assigned to this course."});
  const coachUser=coach.userId?await prisma.user.findFirst({where:{id:coach.userId,role:"coach",active:true}}):null;
  if(!coachUser||coachUser.role!=="coach"||!coachUser.active)return res.status(409).json({message:"This coach profile is not linked to an active coach account."});
  const coursePrice=course.price;
  const timeRange=(value:string)=>{const p=value.split(/\s*(?:—|–|-)\s*/);const min=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]};const start=min(p[0]||""),end=min(p[1]||"");return p.length===2&&end>start?{start,end}:null};
  const wanted=timeRange(b.time);if(!wanted||wanted.end-wanted.start!==course.duration)return res.status(400).json({message:`Choose a ${course.duration}-minute time slot.`});
  if(wanted.start<360||wanted.end>1260||wanted.start%60!==0)return res.status(400).json({message:"Choose a start time between 6:00 AM and 8:00 PM."});
  if(b.date===today()&&wanted.start<=new Date().getHours()*60+new Date().getMinutes())return res.status(400).json({message:"Choose a time that has not passed yet."});
  const other=await prisma.booking.findMany({where:{date:b.date,status:{in:occupyingStatuses},OR:[{courtId:b.courtId},{coachId:b.coachId}]},select:{time:true,courtId:true,coachId:true}});
  const overlap=(x:string)=>{const r=timeRange(x);return !!r&&wanted.start<r.end&&r.start<wanted.end};
  if(other.some(x=>overlap(x.time)&&(x.courtId===b.courtId||x.coachId===b.coachId)))return res.status(409).json({message:"The selected court or coach has just become unavailable."});
  const blocks=await courtBlocks(b.date,b.courtId);
  if(blocks.some(x=>Number(x.active)!==0&&overlap(`${x.start} — ${x.end}`)))return res.status(409).json({message:"The selected court is reserved during this time."});
  const member=await prisma.user.findUnique({where:{id:req.user!.id},select:{name:true,email:true,phone:true}});
  const meta=JSON.stringify({courseId:course.id,courseTitle:course.title,memberEmail:member?.email,memberPhone:member?.phone});
  const booking=await prisma.$transaction(async tx=>{
    await tx.$executeRawUnsafe(`UPDATE "Court" SET status=status WHERE id=?`,b.courtId);
    await tx.$executeRawUnsafe(`UPDATE "Coach" SET status=status WHERE id=?`,b.coachId);
    const conflicts=await tx.booking.findMany({where:{date:b.date,status:{in:occupyingStatuses},OR:[{courtId:b.courtId},{coachId:b.coachId}]},select:{time:true,courtId:true,coachId:true}});
    if(conflicts.some(x=>(x.courtId===b.courtId||x.coachId===b.coachId)&&overlap(x.time)))throw Object.assign(new Error("The selected court or coach has just become unavailable."),{statusCode:409});
    if(blocks.some(x=>Number(x.active)!==0&&overlap(`${x.start} — ${x.end}`)))throw Object.assign(new Error("The selected court is reserved during this time."),{statusCode:409});
    const created=await tx.booking.create({data:{code:code("PC"),userId:req.user!.id,kind:"private_course",title:course.title,date:b.date,time:b.time,location:court.name,courtId:court.id,coachId:coach.id,price:coursePrice,meta, status:"PENDING_COACH_CONFIRMATION",paymentStatus:"pending",reservationExpiresAt:new Date(Date.now()+2*60*60*1000)}});
    return created;
  });
  await prisma.notification.create({data:{userId:req.user!.id,title:"Private course request sent",body:`${course.title} with ${coach.name} · ${b.date} · ${b.time} · ${court.name}. The court is temporarily reserved while the coach reviews your request.`,link:"/bookings",audience:"member",type:"booking",icon:"clock",imageUrl:coach.imageUrl||undefined,actionLabel:"View request",entityType:"booking",entityId:booking.id}});
  if(coachUser)await prisma.notification.create({data:{userId:coachUser.id,title:"Private course request",body:`${course.title} · ${b.date} · ${b.time} · ${court.name}. Please confirm or deny this request.`,link:"/coach/bookings",audience:"coach",type:"booking",icon:"calendar",imageUrl:coach.imageUrl||undefined,actionLabel:"Review request",entityType:"booking",entityId:booking.id}});
  res.status(201).json({booking});
}));
app.post("/api/coach/private-courses/:id/decision",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const decision=z.object({decision:z.enum(["confirm","deny"])}).parse(req.body);
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{coach:true,court:true,user:true}});
  if(!booking||booking.kind!=="private_course")return res.status(404).json({message:"Private course request not found."});
  if(!booking.coach||booking.coach.userId!==req.user!.id)return res.status(403).json({message:"This request belongs to another coach."});
  if(booking.status!=="PENDING_COACH_CONFIRMATION")return res.status(409).json({message:`This request is already ${String(booking.status).replaceAll("_"," ").toLowerCase()}.`});
  if(booking.reservationExpiresAt&&booking.reservationExpiresAt<=new Date())return res.status(409).json({message:"This request has expired and the court has been released."});
  if(decision.decision==="deny") {
    const updated=await prisma.$transaction(async tx=>{
      const changed=await tx.booking.updateMany({where:{id:booking.id,status:"PENDING_COACH_CONFIRMATION"},data:{status:"COACH_DECLINED",reservationExpiresAt:null}});
      if(!changed.count)throw Object.assign(new Error("This request is no longer pending."),{statusCode:409});
      await tx.notification.create({data:{userId:booking.userId,title:"Private course request declined",body:`${booking.title} with ${booking.coach!.name} on ${booking.date} at ${booking.time} was declined. The court reservation has been released.`,link:"/bookings",audience:"member",type:"booking",icon:"x-circle",actionLabel:"View bookings",entityType:"booking",entityId:booking.id}});
      return tx.booking.findUniqueOrThrow({where:{id:booking.id}});
    });
    return res.json({booking:updated});
  }
  const updated=await prisma.$transaction(async tx=>{
    const changed=await tx.booking.updateMany({where:{id:booking.id,status:"PENDING_COACH_CONFIRMATION"},data:{status:"AWAITING_PAYMENT",reservationExpiresAt:new Date(Date.now()+15*60*1000)}});
    if(!changed.count)throw Object.assign(new Error("This request is no longer pending."),{statusCode:409});
    await tx.notification.create({data:{userId:booking.userId,title:"Private course approved — payment required",body:`${booking.title} with ${booking.coach!.name} on ${booking.date} at ${booking.time} is approved. Your court is reserved for 15 minutes while you complete payment.`,link:"/bookings",audience:"member",type:"payment",icon:"credit-card",actionLabel:"Pay now",entityType:"booking",entityId:booking.id}});
    return tx.booking.findUniqueOrThrow({where:{id:booking.id},include:{coach:true,court:true}});
  });
  return res.json({booking:updated});
}));
app.get("/api/coach/private-courses",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const coach=await prisma.coach.findUnique({where:{userId:req.user!.id}});
  if(!coach)return res.json([]);
  res.json(await prisma.booking.findMany({where:{coachId:coach.id,kind:"private_course",status:{in:["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT","CONFIRMED","COMPLETED"]}},include:{user:{select:{id:true,name:true,email:true,phone:true}},court:true},orderBy:[{date:"asc"},{time:"asc"}]}));
}));
app.post("/api/coach/private-courses/:id/complete",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{coach:true}});
  if(!booking||booking.kind!=="private_course")return res.status(404).json({message:"Private course booking not found."});
  if(!booking.coach||booking.coach.userId!==req.user!.id)return res.status(403).json({message:"This booking belongs to another coach."});
  if(booking.status!=="CONFIRMED")return res.status(409).json({message:"Only paid and confirmed courses can be completed."});
  if(booking.date>today())return res.status(409).json({message:"This course is scheduled for a future date."});
  const updated=await prisma.booking.update({where:{id:booking.id},data:{status:"COMPLETED"}});
  await prisma.notification.create({data:{userId:booking.userId,title:"Private course completed",body:`${booking.title} on ${booking.date} has been marked complete.`,link:"/bookings",audience:"member",type:"booking"}});
  res.json(updated);
}));
app.get("/api/coach/calendar",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const coach=await prisma.coach.findUnique({where:{userId:req.user!.id}});
  if(!coach)return res.json({coach:null,bookings:[]});
  const start=String(req.query.start||today()),end=String(req.query.end||start);
  const bookings=await prisma.booking.findMany({where:{coachId:coach.id,date:{gte:start,lte:end},status:{in:["AWAITING_PAYMENT","CONFIRMED"]}},include:{user:{select:{name:true}},court:true},orderBy:[{date:"asc"},{time:"asc"}]});
  res.json({coach,bookings});
}));
app.post("/api/member/private-courses/:id/cancel",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{coach:true}});
  if(!booking||booking.userId!==req.user!.id||booking.kind!=="private_course")return res.status(404).json({message:"Private course booking not found."});
  if(!["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"].includes(booking.status))return res.status(409).json({message:"This booking can no longer be cancelled online."});
  const updated=await prisma.booking.update({where:{id:booking.id},data:{status:"CANCELLED",reservationExpiresAt:null}});
  await prisma.notification.create({data:{userId:req.user!.id,title:"Private course cancelled",body:`${booking.title} on ${booking.date} at ${booking.time} was cancelled.`,link:"/bookings",audience:"member",type:"booking"}});
  const coachUser=booking.coach?.userId?await prisma.user.findUnique({where:{id:booking.coach.userId}}):null;
  if(coachUser)await prisma.notification.create({data:{userId:coachUser.id,title:"Private course cancelled",body:`A member cancelled ${booking.title} · ${booking.date} · ${booking.time}.`,link:"/coach/schedule",audience:"coach",type:"booking"}});
  res.json(updated);
}));
app.post("/api/member/private-courses/:id/pay",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const booking=await prisma.booking.findFirst({where:{id:String(req.params.id),userId:req.user!.id,kind:"private_course",status:"AWAITING_PAYMENT"}});
  if(!booking)return res.status(404).json({message:"Booking not found or not awaiting payment."});
  const payment=await startKPayAttempt(req.user!.id,"private_course",booking.id,booking.price,`Private course · ${booking.title}`);res.json({booking,payment});
}));
app.get("/api/badminton/private-course-payments",auth,roles("admin","badminton_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.booking.findMany({where:{kind:"private_course",status:"AWAITING_PAYMENT"},include:{user:{select:{name:true,email:true}},coach:true,court:true},orderBy:[{date:"asc"},{time:"asc"}]}))));
app.post("/api/badminton/private-courses/:id/payment",auth,roles("admin","badminton_fo"),asyncRoute(async(req:AuthRequest,res)=>{
  return res.status(410).json({message:"Manual booking settlement is disabled. Confirmations come from verified KPay payment."});
  /*
  await expirePrivateCourseReservations();
  const b=z.object({paymentMethod:z.enum(["Cash","KPay","Bank Transfer"])}).parse(req.body);
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{user:true,coach:true}});
  if(!booking||booking.kind!=="private_course")return res.status(404).json({message:"Private course booking not found."});
  if(booking.status!=="AWAITING_PAYMENT")return res.status(409).json({message:"This booking is not awaiting payment."});
  const result=await prisma.$transaction(async tx=>{
    const changed=await tx.booking.updateMany({where:{id:booking.id,status:"AWAITING_PAYMENT"},data:{status:"CONFIRMED",paymentStatus:"paid",reservationExpiresAt:null}});
    if(!changed.count)throw Object.assign(new Error("This booking is no longer awaiting payment."),{statusCode:409});
    await tx.transaction.create({data:{userId:booking.userId,date:booking.date,customer:booking.user.name,business:"Badminton",item:`Private course · ${booking.title}`,amount:booking.price,discount:0,tax:0,finalAmount:booking.price,paymentMethod:b.paymentMethod,staff:req.user!.name,status:"paid"}});
    const confirmed=await tx.booking.findUniqueOrThrow({where:{id:booking.id}});
    await tx.notification.create({data:{userId:booking.userId,title:"Private course confirmed",body:`Payment received. ${booking.title} on ${booking.date} at ${booking.time} is confirmed.`,link:"/bookings",audience:"member",type:"booking"}});
    const coachUser=booking.coach?.userId?await tx.user.findUnique({where:{id:booking.coach.userId}}):null;
    if(coachUser)await tx.notification.create({data:{userId:coachUser.id,title:"Private course booked",body:`${booking.user.name} paid for ${booking.title} · ${booking.date} · ${booking.time} · ${booking.location}.`,link:"/coach/schedule",audience:"coach",type:"booking"}});
    return confirmed;
  });
  res.json(result); */
}));

// KPay status is read-only for the owner. Only a signed provider webhook can
// transition a payment and activate its associated service.
app.get("/api/payments/:id",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const attempt=await prisma.paymentAttempt.findUnique({where:{id:String(req.params.id)}});
  if(!attempt)return res.status(404).json({message:"Payment not found."});
  if(attempt.userId!==req.user!.id&&!['admin','badminton_fo','gym_fo','store_fo','cafe_fo'].includes(req.user!.role))return res.status(403).json({message:"Not allowed."});
  res.json({id:attempt.id,reference:attempt.reference,resourceType:attempt.resourceType,amount:attempt.amount,currency:attempt.currency,status:attempt.status,checkoutUrl:attempt.checkoutUrl,qrCode:attempt.qrCode,expiresAt:attempt.expiresAt});
}));
app.post("/api/payments/kpay/webhook",asyncRoute(async(req:Request,res:Response)=>{
  const raw=(req as any).rawBody as Buffer|undefined;
  if(!raw||!verifyKPaySignature(raw,req.headers["x-kpay-signature"] as string|undefined))return res.status(401).json({message:"Invalid KPay signature."});
  const payload=z.object({reference:z.string(),providerReference:z.string(),amount:z.number().int().positive(),status:z.enum(["PAID","FAILED","EXPIRED"])}).parse(req.body);
  const attempt=await prisma.paymentAttempt.findUnique({where:{reference:payload.reference}});
  if(!attempt)return res.status(404).json({message:"Payment reference not found."});
  if(attempt.amount!==payload.amount||attempt.providerReference!==payload.providerReference)return res.status(409).json({message:"Payment does not match the initiated transaction."});
  if(attempt.status==="SUCCEEDED")return res.json({received:true});
  if(attempt.status!=="PENDING")return res.status(409).json({message:"Payment is no longer active."});
  if(attempt.expiresAt<new Date())payload.status="EXPIRED";
  if(payload.status!=="PAID"){
    await prisma.$transaction(async tx=>{
      await tx.paymentAttempt.updateMany({where:{id:attempt.id,status:"PENDING"},data:{status:payload.status==="FAILED"?"FAILED":"EXPIRED",failureReason:payload.status}});
      if(["court","private_course","booking"].includes(attempt.resourceType))await tx.booking.updateMany({where:{id:attempt.resourceId,status:"AWAITING_PAYMENT"},data:{status:"EXPIRED",reservationExpiresAt:null}});
      if(attempt.resourceType==="badminton_package")await tx.badmintonPackagePurchase.updateMany({where:{id:attempt.resourceId,status:"PENDING"},data:{status:"PAYMENT_FAILED"}});
    });return res.json({received:true});
  }
  const result=await prisma.$transaction(async tx=>{
    const changed=await tx.paymentAttempt.updateMany({where:{id:attempt.id,status:"PENDING"},data:{status:"SUCCEEDED",paidAt:new Date()}});if(!changed.count)return "already";
    const user=await tx.user.findUniqueOrThrow({where:{id:attempt.userId}});
    if(["court","private_course","booking"].includes(attempt.resourceType)){
      const booking=await tx.booking.findUnique({where:{id:attempt.resourceId},include:{court:true,coach:true}});
      if(!booking||booking.status!=="AWAITING_PAYMENT"||booking.reservationExpiresAt&&booking.reservationExpiresAt<new Date())throw Object.assign(new Error("Booking reservation expired before payment completed."),{statusCode:409});
      const updated=await tx.booking.updateMany({where:{id:booking.id,status:"AWAITING_PAYMENT"},data:{status:"CONFIRMED",paymentStatus:"paid",reservationExpiresAt:null}});if(!updated.count)throw Object.assign(new Error("Booking is no longer payable."),{statusCode:409});
      const isCourse=booking.kind==="private_course",isCourt=booking.kind==="court",business=isCourt||isCourse?"Badminton":"Gym";
      await tx.transaction.create({data:{userId:user.id,date:booking.date,customer:user.name,business,item:isCourt?`Court rental · ${booking.title}`:isCourse?`Private course · ${booking.title}`:`Personal training · ${booking.title}`,amount:attempt.amount,discount:0,tax:0,finalAmount:attempt.amount,paymentMethod:"KPay",staff:"KPay",status:"paid"}});
      await tx.notification.create({data:{userId:user.id,title:isCourt?"Court booking confirmed":isCourse?"Private course confirmed":"Training confirmed",body:`KPay payment received. ${booking.title} · ${booking.date} · ${booking.time} is confirmed.`,link:"/bookings",audience:"member",type:"booking",icon:"check-circle",imageUrl:booking.coach?.imageUrl||undefined,actionLabel:"View booking",entityType:"booking",entityId:booking.id}});
      if(booking.coach?.userId)await tx.notification.create({data:{userId:booking.coach.userId,title:isCourse?"New private course booking":"New training booking",body:`${user.name} booked ${booking.title} · ${booking.date} · ${booking.time} · ${booking.location}.`,link:"/coach/schedule",audience:"coach",type:"booking",icon:"calendar",imageUrl:booking.coach.imageUrl||undefined,actionLabel:"View schedule",entityType:"booking",entityId:booking.id}});
      return "confirmed";
    }
    if(attempt.resourceType==="badminton_package"){
      const purchase=await tx.badmintonPackagePurchase.findUnique({where:{id:attempt.resourceId},include:{package:true}});if(!purchase||purchase.status!=="PENDING")throw Object.assign(new Error("Package purchase is no longer active."),{statusCode:409});
      await tx.badmintonPackagePurchase.update({where:{id:purchase.id},data:{status:"PAID",paidAt:new Date(),paymentMethod:"KPay"}});
      const start=today(),expiry=addDaysIso(start,purchase.package.validity),enrollmentId=code("BM");
      await tx.$executeRawUnsafe(`INSERT INTO "BadmintonEnrollment" (id,studentId,userId,studentName,phone,packageId,packageName,sessionsTotal,sessionsRemaining,startDate,expiryDate,status,renewalCount,purchaseId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,enrollmentId,user.id,user.id,user.name,user.phone||"",purchase.packageId,purchase.packageName,purchase.package.sessions,purchase.package.sessions,start,expiry,"active",0,purchase.id);
      await tx.transaction.create({data:{userId:user.id,date:start,customer:user.name,business:"Badminton",item:`Package · ${purchase.packageName}`,amount:attempt.amount,discount:0,tax:0,finalAmount:attempt.amount,paymentMethod:"KPay",staff:"KPay",status:"paid"}});
      await tx.notification.create({data:{userId:user.id,title:"Badminton package activated",body:`KPay payment received for ${purchase.packageName}. Your sessions are ready to use.`,link:"/membership",audience:"member",type:"payment",icon:"trophy",actionLabel:"View package",entityType:"package",entityId:purchase.id}});return "activated";
    }
    if(attempt.resourceType==="cafe_order"){
      const order=await tx.cafeOrder.findUnique({where:{id:attempt.resourceId}});if(!order||order.status!=="payment_pending")throw Object.assign(new Error("Cafe order is no longer payable."),{statusCode:409});
      await tx.cafeOrder.update({where:{id:order.id},data:{status:"confirmed",paymentMethod:"KPay"}});
      const lines=order.items as Array<{name:string;quantity:number}>;const summary=lines.map(line=>`${line.name} ×${line.quantity}`).join(", ");
      await tx.transaction.create({data:{userId:user.id,date:today(),customer:user.name,business:"Cafe",item:summary,amount:attempt.amount,discount:0,tax:0,finalAmount:attempt.amount,paymentMethod:"KPay",staff:"KPay",status:"paid"}});
      await tx.notification.create({data:{userId:user.id,title:"Cafe order confirmed",body:`KPay payment received. Your order is being prepared for ${order.floor}.`,link:"/cafe-order",audience:"member",type:"payment",icon:"shopping-bag",actionLabel:"View order",entityType:"cafe_order",entityId:order.id}});
      await tx.notification.create({data:{userId:null,audience:"cafe_fo",title:"New paid cafe order",body:`${user.name} · ${summary} · ${order.floor}`,link:"/cafe/orders",type:"transaction",icon:"shopping-bag",entityType:"cafe_order",entityId:order.id}});return "confirmed";
    }
    throw Object.assign(new Error("Unsupported payment type."),{statusCode:400});
  });
  res.json({received:true,result});
}));

// Notifications
app.get("/api/notifications",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const history=req.query.history==="1";
  const list=await prisma.notification.findMany({where:{...(history?{}:{activeInInbox:true}),OR:[{userId:req.user!.id},{userId:null,audience:"all"},{userId:null,audience:req.user!.role}]},orderBy:{createdAt:"desc"}});
  res.json(list);
}));
app.patch("/api/notifications/:id/read",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const item=await prisma.notification.findUnique({where:{id:String(req.params.id)}});
  if(!item)return res.status(404).json({message:"Notification not found"});
  if(item.userId!==req.user!.id&&!(item.userId===null&&(item.audience==="all"||item.audience===req.user!.role)))return res.status(403).json({message:"Not allowed"});
  res.json(await prisma.notification.update({where:{id:item.id},data:{read:true,activeInInbox:false}}));
}));

// Analytics
app.get("/api/analytics/overview",auth,roles("admin"),asyncRoute(async(_req,res)=>{
  const [members,revenue,bookings,appointments,lowStock]=await Promise.all([
    prisma.user.count({where:{role:"member"}}),
    prisma.transaction.aggregate({where:{status:"paid"},_sum:{finalAmount:true}}),
    prisma.booking.count({where:{status:{in:["pending","confirmed"]}}}),
    prisma.appointment.count({where:{date:today()}}),
    prisma.product.count({where:{stock:{lte:5},status:"active"}})
  ]);
  const transactions=await prisma.transaction.findMany({where:{status:"paid"},select:{date:true,finalAmount:true}});
  const byDate=Object.values(transactions.reduce((a,t)=>{(a[t.date]??=[]).push(t.finalAmount);return a},{} as Record<string,number[]>)).map((v)=>v.reduce((x,n)=>x+n,0));
  res.json({members,revenue:revenue._sum.finalAmount||0,bookings,appointments,lowStock,series:byDate});
}));

app.use((_req,res)=>res.status(404).json({message:"Route not found"}));
app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{
  console.error(err);
  if(err?.name==="ZodError") return res.status(400).json({message:err.issues?.map((i:any)=>`${i.path?.join(".")||"request"}: ${i.message}`).join("; ")||"Validation error",issues:err.issues});
  if(err?.code==="P2002") return res.status(409).json({message:"A record with that unique value already exists"});
  if(err?.code==="P2025") return res.status(404).json({message:"Record not found"});
  if(err?.statusCode) return res.status(err.statusCode).json({message:err.message||"Request conflict"});
  res.status(500).json({message:"Internal server error"});
});

ensureBadmintonBookingTables().then(()=>ensurePrivateCourseTables()).then(()=>ensureStorePosTables()).then(()=>ensureCentralUserIdentity()).then(()=>app.listen(PORT,()=>console.log(`Zawana API running on http://localhost:${PORT}`))).catch((error)=>{console.error("Failed to prepare database tables",error);process.exit(1)});
