
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { z } from "zod";
import { PrismaClient, Role, BookingStatus, CourtStatus } from "@prisma/client";
import storeRoutes from "./routes/store.js";
import menuRoutes from "./routes/menu.js";

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 8000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || ["http://localhost:5173"], credentials: true }));
app.use(express.json());

// Store/POS and Cafe menu routes. These must be registered on the actual server entrypoint
// (src/server.ts); src/app.ts is not used by the dev/start scripts.
app.use("/api/store", storeRoutes);
app.use("/api/menu", menuRoutes);

type AuthRequest = Request & { user?: { id: string; role: Role; email: string; name: string } };

function tokenFor(user: { id: string; role: Role; email: string; name: string }) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required" });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET) as AuthRequest["user"];
    next();
  } catch { return res.status(401).json({ message: "Invalid or expired token" }); }
}

function roles(...allowed: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) return res.status(403).json({ message: "Insufficient permissions" });
    next();
  };
}

const asyncRoute = (fn: any) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
const today = () => new Date().toISOString().slice(0, 10);
const code = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;
async function expirePrivateCourseReservations(){
  const now=new Date();
  const expired=await prisma.booking.findMany({where:{kind:"private_course",status:{in:["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"]},reservationExpiresAt:{lte:now}},select:{id:true,userId:true,title:true,date:true,time:true}});
  for(const booking of expired){
    const result=await prisma.booking.updateMany({where:{id:booking.id,status:{in:["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"]},reservationExpiresAt:{lte:now}},data:{status:"EXPIRED"}});
    if(result.count)await prisma.notification.create({data:{userId:booking.userId,title:"Private course request expired",body:`${booking.title} on ${booking.date} at ${booking.time} expired and the court reservation was released.`,link:"/bookings",audience:"member",type:"booking"}});
  }
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
  if(!user || !(await bcrypt.compare(body.password,user.passwordHash))) return res.status(401).json({message:"Invalid email or password"});
  res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role,membership:user.membership,avatar:user.avatar},token:tokenFor({...user,role:user.role})});
}));

app.get("/api/auth/me",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const u=await prisma.user.findUnique({where:{id:req.user!.id}});
  if(!u) return res.status(404).json({message:"User not found"});
  res.json({id:u.id,name:u.name,email:u.email,role:u.role,membership:u.membership,avatar:u.avatar});
}));

// Users / members
app.get("/api/users",auth,roles("admin"),asyncRoute(async(_req,res)=>res.json(await prisma.user.findMany({select:{id:true,name:true,email:true,role:true,phone:true,membership:true,avatar:true,createdAt:true},orderBy:{createdAt:"desc"}}))));
app.patch("/api/users/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const body=z.object({name:z.string().optional(),phone:z.string().optional(),role:z.nativeEnum(Role).optional(),membership:z.string().optional()}).parse(req.body);
  res.json(await prisma.user.update({where:{id:req.params.id},data:body,select:{id:true,name:true,email:true,role:true,phone:true,membership:true}}));
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
app.get("/api/coaches",asyncRoute(async(_req,res)=>res.json(await prisma.coach.findMany({include:{schedules:true},orderBy:{name:"asc"}}))));
app.post("/api/coaches",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string(),specialty:z.string(),phone:z.string(),email:z.string().email(),status:z.enum(["active","inactive"]).optional(),color:z.string().optional()}).parse(req.body);
  res.status(201).json(await prisma.coach.create({data:{...b,status:b.status||"active",color:b.color||"#D6FF3F"}}));
}));
app.patch("/api/coaches/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string().optional(),specialty:z.string().optional(),phone:z.string().optional(),email:z.string().email().optional(),status:z.enum(["active","inactive"]).optional(),color:z.string().optional()}).parse(req.body);
  res.json(await prisma.coach.update({where:{id:req.params.id},data:b}));
}));
app.delete("/api/coaches/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{await prisma.coach.delete({where:{id:req.params.id}});res.status(204).end()}));

// Schedules / coach assignment
app.get("/api/schedules",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const coach=req.user!.role==="coach"?await prisma.coach.findFirst({where:{email:req.user!.email}}):null;
  res.json(await prisma.schedule.findMany({where:req.user!.role==="coach"?{coachId:coach?.id||"__no_coach__"}:{},include:{coach:true},orderBy:[{day:"asc"},{start:"asc"}]}));
}));
app.post("/api/schedules",auth,roles("admin","gym_fo","coach","doctor"),asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({person:z.string(),role:z.enum(["coach","doctor"]),day:z.string(),start:z.string(),end:z.string(),service:z.string().optional(),active:z.boolean().default(true),coachId:z.string().optional()}).parse(req.body);
  if(req.user!.role==="coach"){
    const coach=await prisma.coach.findFirst({where:{email:req.user!.email}});
    if(!coach||b.role!=="coach"||b.coachId!==coach.id)return res.status(403).json({message:"Coaches can only add availability to their own schedule."});
  }
  res.status(201).json(await prisma.schedule.create({data:b,include:{coach:true}}));
}));
app.patch("/api/schedules/:id",auth,roles("admin","gym_fo","coach","doctor"),asyncRoute(async(req:AuthRequest,res)=>{
  if(req.user!.role==="coach"){
    const coach=await prisma.coach.findFirst({where:{email:req.user!.email}}),schedule=await prisma.schedule.findUnique({where:{id:String(req.params.id)}});
    if(!coach||!schedule||schedule.coachId!==coach.id)return res.status(403).json({message:"You can only update your own schedule."});
    if((req.body as any).coachId&&((req.body as any).coachId!==coach.id))return res.status(403).json({message:"You cannot reassign another coach's schedule."});
  }
  const b=z.object({person:z.string().optional(),day:z.string().optional(),start:z.string().optional(),end:z.string().optional(),service:z.string().optional(),active:z.boolean().optional(),coachId:z.string().nullable().optional()}).parse(req.body);
  res.json(await prisma.schedule.update({where:{id:req.params.id},data:b,include:{coach:true}}));
}));
app.delete("/api/schedules/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{await prisma.schedule.delete({where:{id:req.params.id}});res.status(204).end()}));

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
  const coach=req.user!.role==="coach"?await prisma.coach.findFirst({where:{email:req.user!.email}}):null;
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
      const created=await tx.booking.create({data:{...b,price,code:code("ZW"),userId:req.user!.id,status:"confirmed",paymentStatus:b.paymentStatus||"pending"}});
      await tx.notification.create({data:{userId:req.user!.id,title:"Booking confirmed",body:`${b.title} is reserved for ${b.date} at ${b.time}.`,link:"/bookings",audience:"member",type:"booking"}});
      return created;
    });
    return res.status(201).json(booking);
  }
  const overlap=await prisma.booking.findFirst({where:{date:b.date,time:b.time,status:{in:["pending","confirmed"]},OR:[...(b.courtId?[{courtId:b.courtId}]:[]),...(b.coachId?[{coachId:b.coachId}]:[])]}});
  if(overlap)return res.status(409).json({message:"That slot is already booked"});
  const booking=await prisma.booking.create({data:{...b,price:b.price||0,code:code("ZW"),userId:req.user!.id,status:"confirmed",paymentStatus:b.paymentStatus||"pending"}});
  await prisma.notification.create({data:{userId:req.user!.id,title:"Booking confirmed",body:`${b.title} is reserved for ${b.date} at ${b.time}.`,link:"/bookings",audience:"member",type:"booking"}});
  res.status(201).json(booking);
}));

app.patch("/api/bookings/:id",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const existing=await prisma.booking.findUnique({where:{id:req.params.id}}); if(!existing)return res.status(404).json({message:"Booking not found"});
  const staff=["admin","gym_fo","badminton_fo","coach"].includes(req.user!.role); if(!staff&&existing.userId!==req.user!.id)return res.status(403).json({message:"Not allowed"});
  if(existing.kind==="private_course")return res.status(403).json({message:"Private course status is managed through its booking workflow."});
  if(req.user!.role==="member"&&("status" in (req.body||{})||"paymentStatus" in (req.body||{})))return res.status(403).json({message:"Members cannot change booking or payment status."});
  const b=z.object({title:z.string().optional(),date:z.string().optional(),time:z.string().optional(),location:z.string().optional(),price:z.number().int().nonnegative().optional(),paymentStatus:z.enum(["pending","paid","refunded"]).optional(),status:z.nativeEnum(BookingStatus).optional()}).parse(req.body);
  if(existing.kind==="court"){const time=b.time||existing.time; const date=b.date||existing.date; const p=time.split(/\s*(?:—|–|-)\s*/); const mins=(x:string)=>{const m=x.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]}; if(p.length!==2||mins(p[1])-mins(p[0])!==60||mins(p[0])<360||mins(p[1])>1260)return res.status(400).json({message:"Court bookings must be one hour between 6:00 AM and 9:00 PM."}); const conflicts=await prisma.booking.findMany({where:{id:{not:existing.id},date,courtId:existing.courtId!,status:{in:["pending","confirmed"]}},select:{time:true}}); const overlap=(a:string)=>{const x=a.split(/\s*(?:—|–|-)\s*/);return x.length===2&&mins(x[0])<mins(p[1])&&mins(p[0])<mins(x[1])}; if(conflicts.some(x=>overlap(x.time)))return res.status(409).json({message:"That court/time is already booked."}); const blocks=await courtBlocks(date,existing.courtId!); if(blocks.some(x=>overlap(`${x.start} — ${x.end}`)))return res.status(409).json({message:"That court/time is reserved for a class."});}
  res.json(await prisma.booking.update({where:{id:existing.id},data:b}));
}));
app.delete("/api/bookings/:id",auth,asyncRoute(async(req:AuthRequest,res)=>{const existing=await prisma.booking.findUnique({where:{id:req.params.id}});if(!existing)return res.status(404).json({message:"Booking not found"});const staff=["admin","gym_fo","badminton_fo"].includes(req.user!.role);if(!staff&&existing.userId!==req.user!.id)return res.status(403).json({message:"Not allowed"});await prisma.booking.delete({where:{id:existing.id}});res.status(204).end();}));

app.patch("/api/bookings/:id/status",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({status:z.nativeEnum(BookingStatus)}).parse(req.body);
  const existing=await prisma.booking.findUnique({where:{id:req.params.id}});
  if(!existing) return res.status(404).json({message:"Booking not found"});
  if(!["admin","gym_fo","badminton_fo"].includes(req.user!.role)) {
    if(existing.userId!==req.user!.id||b.status!=="cancelled"||existing.kind==="private_course") return res.status(403).json({message:"Members may only cancel their own standard bookings."});
  }
  if(existing.kind==="private_course")return res.status(403).json({message:"Private course status is managed through its booking workflow."});
  res.json(await prisma.booking.update({where:{id:req.params.id},data:{status:b.status}}));
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
app.get("/api/packages/badminton",auth,asyncRoute(async(_req,res)=>res.json(await prisma.badmintonPackage.findMany({orderBy:{title:"asc"}}))));
app.post("/api/packages/badminton",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.badmintonPackage.create({data:req.body}))));
app.patch("/api/packages/badminton/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackage.update({where:{id:req.params.id},data:req.body}))));
app.delete("/api/packages/badminton/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{await prisma.badmintonPackage.delete({where:{id:req.params.id}});res.status(204).end()}));
app.get("/api/packages/gym",auth,asyncRoute(async(_req,res)=>res.json(await prisma.gymPackage.findMany({orderBy:{title:"asc"}}))));
app.post("/api/packages/gym",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.gymPackage.create({data:{...req.body,benefits:req.body.benefits||[]}}))));
app.patch("/api/packages/gym/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>res.json(await prisma.gymPackage.update({where:{id:req.params.id},data:{...req.body,benefits:req.body.benefits||undefined}}))));
app.delete("/api/packages/gym/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{await prisma.gymPackage.delete({where:{id:req.params.id}});res.status(204).end()}));

// Memberships
app.get("/api/memberships",auth,asyncRoute(async(_req,res)=>res.json(await prisma.membership.findMany({orderBy:{expiryDate:"asc"}}))));
app.post("/api/memberships",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.membership.create({data:req.body}))));

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
app.get("/api/badminton/member-accounts",auth,roles("admin","badminton_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.user.findMany({where:{role:"member"},select:{id:true,name:true,email:true,phone:true},orderBy:{name:"asc"}}))));
app.post("/api/badminton/enrollments",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({studentId:z.string().min(1),studentName:z.string().min(1),phone:z.string().default(""),userId:z.string().optional(),packageId:z.string().min(1),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"startDate must be YYYY-MM-DD"),paymentMethod:z.string().min(1).default("Cash")}).parse(req.body);
  if(b.userId&&!(await prisma.user.findFirst({where:{id:b.userId,role:"member"}})))return res.status(400).json({message:"Selected member account was not found."});
  const pkg=await prisma.badmintonPackage.findUnique({where:{id:b.packageId}});
  if(!pkg || pkg.status!=="active") return res.status(400).json({message:"Active badminton package not found"});
  const id=code("BM"); const expiry=addDaysIso(b.startDate,pkg.validity);
  const row=(await prisma.$queryRawUnsafe<any[]>(`INSERT INTO "BadmintonEnrollment" (id,studentId,userId,studentName,phone,packageId,packageName,sessionsTotal,sessionsRemaining,startDate,expiryDate,status,renewalCount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,id,b.studentId,b.userId||null,b.studentName,b.phone,pkg.id,pkg.title,pkg.sessions,pkg.sessions,b.startDate,expiry,"active",0))[0];
  await prisma.transaction.create({data:{date:b.startDate,customer:b.studentName,business:"Badminton",item:`Package · ${pkg.title}`,amount:pkg.price,discount:0,tax:0,finalAmount:pkg.price,paymentMethod:b.paymentMethod,staff:(req as AuthRequest).user?.name||"Badminton FO",status:"paid"}});
  res.status(201).json(row);
}));
app.post("/api/badminton/enrollments/:id/renew",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({packageId:z.string().min(1),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"startDate must be YYYY-MM-DD").default(today()),paymentMethod:z.string().min(1).default("Cash")}).parse(req.body);
  const current=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonEnrollment" WHERE id=?`,req.params.id))[0];
  if(!current) return res.status(404).json({message:"Package enrollment not found"});
  const pkg=await prisma.badmintonPackage.findUnique({where:{id:b.packageId}});
  if(!pkg || pkg.status!=="active") return res.status(400).json({message:"Active badminton package not found"});
  const expiry=addDaysIso(b.startDate,pkg.validity);
  const row=(await prisma.$queryRawUnsafe<any[]>(`UPDATE "BadmintonEnrollment" SET packageId=?,packageName=?,sessionsTotal=?,sessionsRemaining=?,startDate=?,expiryDate=?,status='active',renewalCount=renewalCount+1 WHERE id=? RETURNING *`,pkg.id,pkg.title,pkg.sessions,pkg.sessions,b.startDate,expiry,req.params.id))[0];
  await prisma.transaction.create({data:{date:b.startDate,customer:current.studentName,business:"Badminton",item:`Package renewal · ${pkg.title}`,amount:pkg.price,discount:0,tax:0,finalAmount:pkg.price,paymentMethod:b.paymentMethod,staff:(req as AuthRequest).user?.name||"Badminton FO",status:"paid"}});
  res.json(row);
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
// Appointments
app.get("/api/appointments",auth,asyncRoute(async(_req,res)=>res.json(await prisma.appointment.findMany({orderBy:[{date:"asc"},{time:"asc"}]}))));
app.post("/api/appointments",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.appointment.create({data:req.body}))));
app.patch("/api/appointments/:id/status",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req,res)=>{
  const b=z.object({status:z.enum(["pending","confirmed","checked_in","completed","cancelled"])}).parse(req.body);
  res.json(await prisma.appointment.update({where:{id:req.params.id},data:{status:b.status}}));
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

// Students
app.get("/api/students",auth,asyncRoute(async(_req,res)=>res.json(await prisma.student.findMany({orderBy:{name:"asc"}}))));
app.post("/api/students",auth,roles("admin","badminton_fo","coach"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.student.create({data:req.body}))));
app.patch("/api/students/:id",auth,roles("admin","badminton_fo","coach"),asyncRoute(async(req,res)=>res.json(await prisma.student.update({where:{id:req.params.id},data:req.body}))));
app.delete("/api/students/:id",auth,roles("admin","badminton_fo","coach"),asyncRoute(async(req,res)=>{await prisma.student.delete({where:{id:req.params.id}});res.status(204).end()}));

// Transactions
app.get("/api/transactions",auth,roles("admin","gym_fo","badminton_fo","clinic_fo","store_fo","cafe_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.transaction.findMany({orderBy:{createdAt:"desc"}}))));
app.post("/api/transactions",auth,roles("admin","gym_fo","badminton_fo","clinic_fo","store_fo","cafe_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.transaction.create({data:req.body}))));

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
  const [bookings,packages,notifications,enrollments]=await Promise.all([
    prisma.booking.findMany({where:{userId:req.user!.id},include:{court:true,coach:true},orderBy:{createdAt:"desc"}}),
    prisma.badmintonPackage.findMany({where:{status:"active"},orderBy:{title:"asc"}}),
    prisma.notification.findMany({where:{userId:req.user!.id,read:false},orderBy:{createdAt:"desc"},take:6}),
    prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonEnrollment" WHERE userId=? OR studentId=? ORDER BY createdAt DESC`,req.user!.id,req.user!.id)
  ]);
  const active=enrollments.find(e=>e.status==="active"&&e.expiryDate>=today()&&Number(e.sessionsRemaining)>0)||null;
  const checkIns=active?await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "BadmintonCheckIn" WHERE enrollmentId=? ORDER BY date DESC,time DESC LIMIT 12`,active.id):[];
  res.json({bookings,packages,notifications,enrollment:active,enrollmentHistory:enrollments,checkIns});
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
app.get("/api/private-courses",asyncRoute(async(_req,res)=>res.json(await prisma.privateCourse.findMany({where:{status:"active"},orderBy:{title:"asc"}}))));
app.post("/api/private-courses",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({title:z.string().min(3),description:z.string().default(""),duration:z.number().int().min(30).max(180).default(60),price:z.number().int().nonnegative(),status:z.enum(["active","inactive"]).default("active")}).parse(req.body);
  res.status(201).json(await prisma.privateCourse.create({data:b}));
}));
app.get("/api/member/private-courses",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>res.json(await prisma.booking.findMany({where:{userId:req.user!.id,kind:"private_course"},include:{court:true,coach:true},orderBy:{createdAt:"desc"}}))));
app.get("/api/member/private-course-coaches",auth,roles("member"),asyncRoute(async(_req,res)=>{
  const coaches=await prisma.coach.findMany({where:{status:"active"},include:{schedules:{where:{active:true}}},orderBy:{name:"asc"}});
  const users=await prisma.user.findMany({where:{role:"coach",email:{in:coaches.map(c=>c.email.toLowerCase())}},select:{email:true}});
  const linked=new Set(users.map(u=>u.email.toLowerCase()));
  res.json(coaches.filter(c=>linked.has(c.email.toLowerCase())));
}));
app.post("/api/member/private-courses",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const b=z.object({courseId:z.string(),courtId:z.string(),coachId:z.string(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string()}).parse(req.body);
  if(b.date<today())return res.status(400).json({message:"Choose a future date."});
  const course=await prisma.privateCourse.findFirst({where:{id:b.courseId,status:"active"}});
  if(!course)return res.status(404).json({message:"That course is no longer available."});
  const court=await prisma.court.findUnique({where:{id:b.courtId}}),coach=await prisma.coach.findUnique({where:{id:b.coachId, status:"active"},include:{schedules:true}});
  if(!court||court.status!=="available")return res.status(409).json({message:"That court is unavailable."});
  if(!coach)return res.status(409).json({message:"That coach is unavailable."});
  const coachUser=await prisma.user.findFirst({where:{email:coach.email.toLowerCase(),role:"coach"}});
  if(!coachUser)return res.status(409).json({message:"This coach account is not set up to receive booking requests yet."});
  const timeRange=(value:string)=>{const p=value.split(/\s*(?:—|–|-)\s*/);const min=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]};const start=min(p[0]||""),end=min(p[1]||"");return p.length===2&&end>start?{start,end}:null};
  const wanted=timeRange(b.time);if(!wanted||wanted.end-wanted.start!==course.duration)return res.status(400).json({message:`Choose a ${course.duration}-minute time slot.`});
  if(wanted.start<360||wanted.end>1260||wanted.start%60!==0)return res.status(400).json({message:"Choose a start time between 6:00 AM and 8:00 PM."});
  if(b.date===today()&&wanted.start<=new Date().getHours()*60+new Date().getMinutes())return res.status(400).json({message:"Choose a time that has not passed yet."});
  const weekday=new Date(`${b.date}T00:00:00`).toLocaleDateString("en-US",{weekday:"long"});
  const inSchedule=coach.schedules.some(s=>s.active&&s.day.toLowerCase()===weekday.toLowerCase()&&s.role==="coach"&&(s.service?.toLowerCase().includes("badminton")||coach.specialty.toLowerCase().includes("badminton"))&&(()=>{const start=+s.start.slice(0,2)*60+ +s.start.slice(3,5),end=+s.end.slice(0,2)*60+ +s.end.slice(3,5);return wanted.start>=start&&wanted.end<=end})());
  if(!inSchedule)return res.status(409).json({message:"This coach has no badminton availability for that date and time."});
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
    const created=await tx.booking.create({data:{code:code("PC"),userId:req.user!.id,kind:"private_course",title:course.title,date:b.date,time:b.time,location:court.name,courtId:court.id,coachId:coach.id,price:course.price,meta,status:"PENDING_COACH_CONFIRMATION",paymentStatus:"pending",reservationExpiresAt:new Date(Date.now()+24*60*60*1000)}});
    await tx.notification.create({data:{userId:req.user!.id,title:"Waiting for coach confirmation",body:`${course.title} · ${b.date} · ${b.time} · ${court.name}`,link:"/bookings",audience:"member",type:"booking"}});
    const coachUser=await tx.user.findUnique({where:{email:coach.email.toLowerCase()}});
    if(coachUser)await tx.notification.create({data:{userId:coachUser.id,title:"Private course request",body:`${member?.name||"A member"} requested ${course.title} · ${b.date} · ${b.time} · ${court.name} · Request ${created.code}`,link:"/coach/bookings",audience:"coach",type:"booking"}});
    return created;
  });
  res.status(201).json(booking);
}));
app.post("/api/coach/private-courses/:id/decision",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const b=z.object({decision:z.enum(["confirm","decline"])}).parse(req.body);
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{coach:{include:{schedules:true}},user:true,court:true}});
  if(!booking||booking.kind!=="private_course")return res.status(404).json({message:"Private course request not found."});
  if(!booking.coach||booking.coach.email.toLowerCase()!==req.user!.email.toLowerCase())return res.status(403).json({message:"This request belongs to another coach."});
  if(booking.status!=="PENDING_COACH_CONFIRMATION")return res.status(409).json({message:"This request is no longer waiting for a coach."});
  if(booking.date<today())return res.status(409).json({message:"This course date has passed; the request cannot be confirmed."});
  const updated=await prisma.$transaction(async tx=>{
    if(b.decision==="confirm"){
      await tx.$executeRawUnsafe(`UPDATE "Court" SET status=status WHERE id=?`,booking.courtId);
      await tx.$executeRawUnsafe(`UPDATE "Coach" SET status=status WHERE id=?`,booking.coachId);
      const range=(v:string)=>{const p=v.split(/\s*(?:—|–|-)\s*/);const min=(x:string)=>{const m=x.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]};return p.length===2?[min(p[0]),min(p[1])]:[NaN,NaN]};
      const chosen=range(booking.time), weekday=new Date(`${booking.date}T00:00:00`).toLocaleDateString("en-US",{weekday:"long"});
      const scheduled=booking.coach?.schedules.some(s=>s.active&&s.role==="coach"&&s.day.toLowerCase()===weekday.toLowerCase()&&(s.service?.toLowerCase().includes("badminton")||booking.coach!.specialty.toLowerCase().includes("badminton"))&&(()=>{const start=+s.start.slice(0,2)*60+ +s.start.slice(3,5),end=+s.end.slice(0,2)*60+ +s.end.slice(3,5);return chosen[0]>=start&&chosen[1]<=end})());
      if(!scheduled)throw Object.assign(new Error("Coach availability has changed; this request cannot be confirmed."),{statusCode:409});
      const conflicts=await tx.booking.findMany({where:{id:{not:booking.id},date:booking.date,status:{in:occupyingStatuses},OR:[{courtId:booking.courtId},{coachId:booking.coachId}]},select:{time:true,courtId:true,coachId:true}});
      if(conflicts.some(x=>{const other=range(x.time);return (x.courtId===booking.courtId||x.coachId===booking.coachId)&&chosen[0]<other[1]&&other[0]<chosen[1]}))throw Object.assign(new Error("The court or coach is no longer available."),{statusCode:409});
    }
    const changed=await tx.booking.updateMany({where:{id:booking.id,status:"PENDING_COACH_CONFIRMATION"},data:{status:b.decision==="confirm"?"AWAITING_PAYMENT":"COACH_DECLINED",reservationExpiresAt:b.decision==="confirm"?new Date(Date.now()+24*60*60*1000):null}});
    if(!changed.count)throw Object.assign(new Error("This request is no longer waiting for a coach."),{statusCode:409});
    const updatedBooking=await tx.booking.findUniqueOrThrow({where:{id:booking.id}});
    await tx.notification.create({data:{userId:booking.userId,title:b.decision==="confirm"?"Coach confirmed your private course":"Coach unavailable",body:b.decision==="confirm"?"Your coach confirmed. Payment is required to finalize your booking.":"Unfortunately, the selected coach is unavailable for this time. Choose another time or coach.",link:"/bookings",audience:"member",type:b.decision==="confirm"?"payment":"booking"}});
    return updatedBooking;
  });
  res.json(updated);
}));
app.get("/api/coach/private-courses",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const coach=await prisma.coach.findFirst({where:{email:req.user!.email}});
  if(!coach)return res.json([]);
  res.json(await prisma.booking.findMany({where:{coachId:coach.id,kind:"private_course",status:"PENDING_COACH_CONFIRMATION"},include:{user:{select:{id:true,name:true,email:true,phone:true}},court:true},orderBy:[{date:"asc"},{time:"asc"}]}));
}));
app.post("/api/coach/private-courses/:id/complete",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{coach:true}});
  if(!booking||booking.kind!=="private_course")return res.status(404).json({message:"Private course booking not found."});
  if(!booking.coach||booking.coach.email.toLowerCase()!==req.user!.email.toLowerCase())return res.status(403).json({message:"This booking belongs to another coach."});
  if(booking.status!=="CONFIRMED")return res.status(409).json({message:"Only paid and confirmed courses can be completed."});
  if(booking.date>today())return res.status(409).json({message:"This course is scheduled for a future date."});
  const updated=await prisma.booking.update({where:{id:booking.id},data:{status:"COMPLETED"}});
  await prisma.notification.create({data:{userId:booking.userId,title:"Private course completed",body:`${booking.title} on ${booking.date} has been marked complete.`,link:"/bookings",audience:"member",type:"booking"}});
  res.json(updated);
}));
app.get("/api/coach/calendar",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const coach=await prisma.coach.findFirst({where:{email:req.user!.email}});
  if(!coach)return res.json({coach:null,bookings:[],schedules:[]});
  const start=String(req.query.start||today()),end=String(req.query.end||start);
  const bookings=await prisma.booking.findMany({where:{coachId:coach.id,date:{gte:start,lte:end},status:{notIn:["cancelled","CANCELLED","COACH_DECLINED","EXPIRED","COMPLETED"]}},include:{user:{select:{name:true}},court:true},orderBy:[{date:"asc"},{time:"asc"}]});
  const weekdayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dayNames=new Set(Array.from({length:Math.min(31,Math.ceil((new Date(end).getTime()-new Date(start).getTime())/86400000)+1)},(_,i)=>weekdayNames[new Date(new Date(start).getTime()+i*86400000).getDay()]));
  const schedules=await prisma.schedule.findMany({where:{coachId:coach.id,active:true,day:{in:[...dayNames]}}});
  res.json({coach,bookings,schedules});
}));
app.post("/api/member/private-courses/:id/cancel",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{coach:true}});
  if(!booking||booking.userId!==req.user!.id||booking.kind!=="private_course")return res.status(404).json({message:"Private course booking not found."});
  if(!["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"].includes(booking.status))return res.status(409).json({message:"This booking can no longer be cancelled online."});
  const updated=await prisma.booking.update({where:{id:booking.id},data:{status:"CANCELLED",reservationExpiresAt:null}});
  await prisma.notification.create({data:{userId:req.user!.id,title:"Private course cancelled",body:`${booking.title} on ${booking.date} at ${booking.time} was cancelled.`,link:"/bookings",audience:"member",type:"booking"}});
  const coachUser=booking.coach?await prisma.user.findUnique({where:{email:booking.coach.email.toLowerCase()}}):null;
  if(coachUser)await prisma.notification.create({data:{userId:coachUser.id,title:"Private course cancelled",body:`A member cancelled ${booking.title} · ${booking.date} · ${booking.time}.`,link:"/coach/schedule",audience:"coach",type:"booking"}});
  res.json(updated);
}));
app.post("/api/member/private-courses/:id/pay",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)}});
  if(!booking||booking.userId!==req.user!.id)return res.status(404).json({message:"Booking not found."});
  if(booking.kind!=="private_course"||booking.status!=="AWAITING_PAYMENT")return res.status(409).json({message:"This booking is not awaiting payment."});
  return res.status(501).json({message:"Online payment is not configured yet. Please contact the badminton front desk to pay and confirm this booking."});
}));
app.get("/api/badminton/private-course-payments",auth,roles("admin","badminton_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.booking.findMany({where:{kind:"private_course",status:"AWAITING_PAYMENT"},include:{user:{select:{name:true,email:true}},coach:true,court:true},orderBy:[{date:"asc"},{time:"asc"}]}))));
app.post("/api/badminton/private-courses/:id/payment",auth,roles("admin","badminton_fo"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const b=z.object({paymentMethod:z.enum(["Cash","KPay","Bank Transfer"])}).parse(req.body);
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{user:true,coach:true}});
  if(!booking||booking.kind!=="private_course")return res.status(404).json({message:"Private course booking not found."});
  if(booking.status!=="AWAITING_PAYMENT")return res.status(409).json({message:"This booking is not awaiting payment."});
  const result=await prisma.$transaction(async tx=>{
    const changed=await tx.booking.updateMany({where:{id:booking.id,status:"AWAITING_PAYMENT"},data:{status:"CONFIRMED",paymentStatus:"paid",reservationExpiresAt:null}});
    if(!changed.count)throw Object.assign(new Error("This booking is no longer awaiting payment."),{statusCode:409});
    await tx.transaction.create({data:{date:booking.date,customer:booking.user.name,business:"Badminton",item:`Private course · ${booking.title}`,amount:booking.price,discount:0,tax:0,finalAmount:booking.price,paymentMethod:b.paymentMethod,staff:req.user!.name,status:"paid"}});
    const confirmed=await tx.booking.findUniqueOrThrow({where:{id:booking.id}});
    await tx.notification.create({data:{userId:booking.userId,title:"Private course confirmed",body:`Payment received. ${booking.title} on ${booking.date} at ${booking.time} is confirmed.`,link:"/bookings",audience:"member",type:"booking"}});
    const coachUser=booking.coach?await tx.user.findFirst({where:{email:booking.coach.email.toLowerCase(),role:"coach"}}):null;
    if(coachUser)await tx.notification.create({data:{userId:coachUser.id,title:"Private course booked",body:`${booking.user.name} paid for ${booking.title} · ${booking.date} · ${booking.time} · ${booking.location}.`,link:"/coach/schedule",audience:"coach",type:"booking"}});
    return confirmed;
  });
  res.json(result);
}));

// Notifications
app.get("/api/notifications",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const list=await prisma.notification.findMany({where:{OR:[{userId:req.user!.id},{userId:null,audience:"all"},{userId:null,audience:req.user!.role}]},orderBy:{createdAt:"desc"}});
  res.json(list);
}));
app.patch("/api/notifications/:id/read",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const item=await prisma.notification.findUnique({where:{id:String(req.params.id)}});
  if(!item)return res.status(404).json({message:"Notification not found"});
  if(item.userId!==req.user!.id&&!(item.userId===null&&(item.audience==="all"||item.audience===req.user!.role)))return res.status(403).json({message:"Not allowed"});
  res.json(await prisma.notification.update({where:{id:item.id},data:{read:true}}));
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

ensureBadmintonBookingTables().then(()=>ensurePrivateCourseTables()).then(()=>ensureStorePosTables()).then(()=>app.listen(PORT,()=>console.log(`Zawana API running on http://localhost:${PORT}`))).catch((error)=>{console.error("Failed to prepare database tables",error);process.exit(1)});
