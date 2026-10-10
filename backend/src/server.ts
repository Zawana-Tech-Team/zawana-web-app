
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { Role, BookingStatus, CourtStatus, TransactionBusiness } from "@prisma/client";
import storeRoutes from "./routes/store.js";
import menuRoutes from "./routes/menu.js";
import authRoutes from "./routes/auth.js";
import mediaRoutes from "./routes/media.js";
import cafeRoutes from "./routes/cafe.js";
import gymTrainingRoutes from "./routes/gymTraining.js";
import { auth, roles } from "./middleware/auth.js";
import type { AuthRequest } from "./types/auth.js";
import { env } from "./config/env.js";
import { createKPayCheckout, kpayIsConfigured, verifyKPaySignature } from "./services/kpay.js";
import { prisma } from "./lib/prisma.js";
import { toSafeAppUser } from "./services/userSerializer.js";
import { registerBookingQueryRoutes } from "./routes/bookingQueries.js";
import { isDateKey } from "./utils/dateKeys.js";
import { asyncRoute } from "./utils/asyncRoute.js";
import { isStoredImageUrl } from "./services/mediaStorage.js";
import { firebaseAdminAuth } from "./services/firebaseAdmin.js";

const app = express();
const PORT = env.port;
const sqliteDatabase = env.databaseUrl.startsWith("file:");
const portableSql = (sql:string) => {
  if (sqliteDatabase) return sql;
  let index=0;
  return sql.replace(/\?/g,()=>`$${++index}`).replace(/\bactive\s*=\s*1\b/g,"active=TRUE").replace(/(?<!["A-Za-z0-9_])([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)(?!["A-Za-z0-9_])/g,(_match,identifier)=>`"${identifier}"`);
};
const rawQuery=<T=unknown>(client:any,sql:string,...values:any[]):Promise<T>=>client.$queryRawUnsafe(portableSql(sql),...values);
const rawExec=(client:any,sql:string,...values:any[])=>client.$executeRawUnsafe(portableSql(sql),...values);
const coachUploadPath=fileURLToPath(new URL("../uploads/coaches/",import.meta.url));
const courseUploadPath=fileURLToPath(new URL("../uploads/courses/",import.meta.url));
const profileUploadPath=fileURLToPath(new URL("../uploads/profiles/",import.meta.url));

app.use(cors({ origin: env.clientUrls, credentials: true }));
app.use(express.json({limit:"8mb",verify:(req:any,_res,buffer)=>{req.rawBody=Buffer.from(buffer)}}));
app.use("/uploads/coaches",express.static(coachUploadPath));
app.use("/uploads/courses",express.static(courseUploadPath));
app.use("/uploads/profiles",express.static(profileUploadPath));
app.use("/uploads/media",express.static(fileURLToPath(new URL("../uploads/media/",import.meta.url))));

// Store/POS and Cafe menu routes. These must be registered on the actual server entrypoint
// (src/server.ts); src/app.ts is not used by the dev/start scripts.
app.use("/api/store", storeRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/auth",authRoutes);
app.use("/api/media",mediaRoutes);
app.use("/api/cafe",cafeRoutes);
app.use("/api",gymTrainingRoutes);

const businessTimeZone=process.env.BUSINESS_TIME_ZONE||"Asia/Yangon";
const businessNow=()=>{
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:businessTimeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const part=(type:string)=>Number(parts.find(p=>p.type===type)?.value||0);
  const hour=part("hour"),minute=part("minute");
  return {hour,minute,clock:`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`};
};
const today = () => {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:businessTimeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const part=(type:string)=>parts.find(p=>p.type===type)?.value||"00";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const code = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
const publicApiUrl = () => env.publicApiUrl.replace(/\/$/, "");
const clientUrl = () => env.clientUrls[0].replace(/\/$/, "");
async function startKPayAttempt(userId:string, resourceType:string, resourceId:string, amount:number, description:string, expiresAt=new Date(Date.now()+15*60*1000)) {
  if (!kpayIsConfigured()) throw Object.assign(new Error(resourceType==="private_course"?"KPay checkout is not configured yet. Your accepted course remains reserved until its payment deadline.":"KPay checkout is not configured yet."),{statusCode:503});
  const reference=code("KP");
  const {attempt,isNew}=await prisma.$transaction(async tx=>{
    if(resourceType==="private_course"){
      await rawExec(tx,`UPDATE "Booking" SET id=id WHERE id=?`,resourceId);
      const booking=await tx.booking.findUnique({where:{id:resourceId},select:{status:true,paymentExpiresAt:true,reservationExpiresAt:true}});
      const deadline=booking?.paymentExpiresAt||booking?.reservationExpiresAt;
      if(booking?.status!=="AWAITING_PAYMENT"||!deadline||deadline<=new Date())throw Object.assign(new Error("The private course payment window has expired or is no longer active."),{statusCode:409});
    }
    const active=await tx.paymentAttempt.findFirst({where:{userId,resourceType,resourceId,status:{in:["PENDING","INITIATING"]},expiresAt:{gt:new Date()}},orderBy:{createdAt:"desc"}});
    return active?{attempt:active,isNew:false}:{attempt:await tx.paymentAttempt.create({data:{reference,userId,resourceType,resourceId,amount,expiresAt}}),isNew:true};
  });
  if(!isNew)return attempt;
  try {
    const checkout=await createKPayCheckout({reference,amount,currency:"MMK",description,callbackUrl:process.env.KPAY_CALLBACK_URL||`${publicApiUrl()}/api/payments/kpay/webhook`,returnUrl:`${clientUrl()}/payment/${attempt.id}`});
    return await prisma.paymentAttempt.update({where:{id:attempt.id},data:{providerReference:checkout.providerReference,checkoutUrl:checkout.checkoutUrl,qrCode:checkout.qrCode,status:"PENDING"}});
  } catch(error) { await prisma.paymentAttempt.delete({where:{id:attempt.id}}); throw error; }
}
async function expirePrivateCourseReservations(){
  const now=new Date();
  const expired=await prisma.booking.findMany({where:{kind:"private_course",OR:[
    {status:"PENDING_COACH_CONFIRMATION",reservationExpiresAt:{lte:now}},
    {status:"AWAITING_PAYMENT",OR:[{paymentExpiresAt:{lte:now}},{paymentExpiresAt:null,reservationExpiresAt:{lte:now}}]}
  ]},select:{id:true,userId:true,title:true,date:true,time:true,status:true,coachAcceptedAt:true,paymentExpiresAt:true,reservationExpiresAt:true,coach:{select:{userId:true,name:true}}}});
  for(const booking of expired){
    const deadline=booking.status==="AWAITING_PAYMENT"?(booking.paymentExpiresAt||booking.reservationExpiresAt):booking.reservationExpiresAt;
    if(!deadline||deadline>now)continue;
    const result=await prisma.$transaction(async tx=>{
      const changed=await tx.booking.updateMany({where:{id:booking.id,status:booking.status,...(booking.status==="AWAITING_PAYMENT"?{OR:[{paymentExpiresAt:{lte:now}},{paymentExpiresAt:null,reservationExpiresAt:{lte:now}}]}:{reservationExpiresAt:{lte:now}})},data:{status:"EXPIRED",reservationExpiresAt:null,paymentExpiresAt:null}});
      if(!changed.count)return false;
      await tx.notification.create({data:{userId:booking.userId,title:booking.status==="AWAITING_PAYMENT"?"Private course payment window expired":"Private course request expired",body:`${booking.title} on ${booking.date} at ${booking.time} expired and the court reservation was released.`,link:"/bookings",audience:"member",type:"booking",icon:"clock",entityType:"booking",entityId:booking.id}});
      if(booking.coach?.userId)await tx.notification.create({data:{userId:booking.coach.userId,title:"Private course reservation released",body:`The reservation for ${booking.title} · ${booking.date} · ${booking.time} expired and is no longer on your schedule.`,link:"/coach/schedule",audience:"coach",type:"booking",icon:"clock",entityType:"booking",entityId:booking.id}});
      return true;
    });
  }
  const attempts=await prisma.paymentAttempt.findMany({where:{status:"PENDING",expiresAt:{lte:now}}});
  for(const attempt of attempts)await prisma.$transaction(async tx=>{
    const changed=await tx.paymentAttempt.updateMany({where:{id:attempt.id,status:"PENDING",expiresAt:{lte:now}},data:{status:"EXPIRED",failureReason:"Checkout expired"}});if(!changed.count)return;
    if(["court","booking"].includes(attempt.resourceType))await tx.booking.updateMany({where:{id:attempt.resourceId,status:"AWAITING_PAYMENT"},data:{status:"EXPIRED",reservationExpiresAt:null}});
    if(attempt.resourceType==="badminton_package")await tx.badmintonPackagePurchase.updateMany({where:{id:attempt.resourceId,status:"PENDING"},data:{status:"PAYMENT_EXPIRED"}});
    if(attempt.resourceType!=="private_course")await tx.notification.create({data:{userId:attempt.userId,title:"Payment session expired",body:"Your KPay checkout expired. No payment was recorded; you can start a new checkout.",link:attempt.resourceType==="badminton_package"?"/membership":"/bookings",audience:"member",type:"payment",icon:"clock",entityType:attempt.resourceType,entityId:attempt.resourceId}});
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
  const cols = await rawQuery<any[]>(prisma,`PRAGMA table_info("Product")`);
  const names = new Set(cols.map(c => String(c.name)));
  if (!names.has("categoryId")) await rawExec(prisma,`ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT`);
  if (!names.has("imageUrl")) await rawExec(prisma,`ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId")`);

  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "ProductCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_name_key" ON "ProductCategory"("name")`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "CafeMenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const menuColumns = await rawQuery<any[]>(prisma,`PRAGMA table_info("CafeMenuItem")`);
  if (!menuColumns.some(column => String(column.name) === "imageUrl")) await rawExec(prisma,`ALTER TABLE "CafeMenuItem" ADD COLUMN "imageUrl" TEXT`);
  await rawExec(prisma,`INSERT OR IGNORE INTO "ProductCategory" ("id","name","active") VALUES
    ('seed-cat-apparel','Apparel',1),('seed-cat-equipment','Equipment',1),('seed-cat-accessories','Accessories',1)`);
  await rawExec(prisma,`INSERT OR IGNORE INTO "CafeMenuItem" ("id","name","category","description","price","available") VALUES
    ('seed-menu-americano','Iced Americano','Coffee','Cold brewed espresso over ice.',5000,1),
    ('seed-menu-wrap','Chicken Wrap','Food','Chicken wrap for a quick post-training meal.',9000,1),
    ('seed-menu-bowl','Protein Bowl','Healthy','Protein-focused bowl.',12000,1)`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "PrivateTrainingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,"memberId" TEXT NOT NULL,"coachId" TEXT NOT NULL,"date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,"endTime" TEXT NOT NULL,"durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',"notes" TEXT,"createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivateTrainingSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrivateTrainingSession_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PrivateTrainingSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "PrivateTrainingSession_memberId_date_status_idx" ON "PrivateTrainingSession"("memberId","date","status")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "PrivateTrainingSession_coachId_date_status_idx" ON "PrivateTrainingSession"("coachId","date","status")`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "CafeOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,"orderId" TEXT NOT NULL,"menuItemId" TEXT,"name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,"unitPrice" INTEGER NOT NULL,"notes" TEXT,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CafeOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CafeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CafeOrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "CafeMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "CafeOrderItem_orderId_idx" ON "CafeOrderItem"("orderId")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "CafeOrderItem_menuItemId_idx" ON "CafeOrderItem"("menuItemId")`);
  const cafeOrderColumns = await rawQuery<any[]>(prisma,`PRAGMA table_info("CafeOrder")`);
  const cafeOrderColumnNames = new Set(cafeOrderColumns.map(column => String(column.name)));
  const cafeOrderAdditions: [string,string][] = [
    ["orderNumber","TEXT"],["customerId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
    ["location","TEXT NOT NULL DEFAULT 'Cafe'"],["courtId",'TEXT REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
    ["paymentStatus","TEXT NOT NULL DEFAULT 'pending'"],["subtotal","INTEGER NOT NULL DEFAULT 0"],
    ["discount","INTEGER NOT NULL DEFAULT 0"],["tax","INTEGER NOT NULL DEFAULT 0"],["total","INTEGER NOT NULL DEFAULT 0"],
    ["createdById",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
    ["transactionId",'TEXT REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE'],
    ["createdAt","DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"],["updatedAt","DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"]
  ];
  for (const [column,definition] of cafeOrderAdditions) if (!cafeOrderColumnNames.has(column)) await rawExec(prisma,`ALTER TABLE "CafeOrder" ADD COLUMN "${column}" ${definition}`);
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "CafeOrder_orderNumber_key" ON "CafeOrder"("orderNumber")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "CafeOrder_status_createdAt_idx" ON "CafeOrder"("status","createdAt")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "CafeOrder_location_createdAt_idx" ON "CafeOrder"("location","createdAt")`);
  const storeOrderColumns=await rawQuery<any[]>(prisma,`PRAGMA table_info("StoreOrder")`);
  const storeOrderNames=new Set(storeOrderColumns.map(column=>String(column.name)));
  if(!storeOrderNames.has("discount"))await rawExec(prisma,`ALTER TABLE "StoreOrder" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0`);
  if(!storeOrderNames.has("tax"))await rawExec(prisma,`ALTER TABLE "StoreOrder" ADD COLUMN "tax" INTEGER NOT NULL DEFAULT 0`);
}

async function ensureGymSessionTables(){
  const gymCols=await rawQuery<any[]>(prisma,`PRAGMA table_info("GymPackage")`);
  if(!gymCols.some(c=>String(c.name)==="sessions"))await rawExec(prisma,`ALTER TABLE "GymPackage" ADD COLUMN "sessions" INTEGER NOT NULL DEFAULT 0`);
  const membershipCols=await rawQuery<any[]>(prisma,`PRAGMA table_info("Membership")`),names=new Set(membershipCols.map(c=>String(c.name)));
  if(!names.has("sessionsTotal"))await rawExec(prisma,`ALTER TABLE "Membership" ADD COLUMN "sessionsTotal" INTEGER NOT NULL DEFAULT 0`);
  if(!names.has("sessionsRemaining"))await rawExec(prisma,`ALTER TABLE "Membership" ADD COLUMN "sessionsRemaining" INTEGER NOT NULL DEFAULT 0`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "GymCheckIn"("id" TEXT NOT NULL PRIMARY KEY,"membershipId" TEXT NOT NULL,"date" TEXT NOT NULL,"time" TEXT NOT NULL,"sessionsUsed" INTEGER NOT NULL DEFAULT 1,"staffId" TEXT,"note" TEXT,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "GymCheckIn_membershipId_fkey" FOREIGN KEY("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "GymCheckIn_membershipId_date_key" ON "GymCheckIn"("membershipId","date")`);
}

async function ensureBadmintonBookingTables() {
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "CourtBlock" (
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
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "CourtBlock_courtId_date_idx" ON "CourtBlock"("courtId", "date")`);
  try { await rawExec(prisma,`ALTER TABLE "CourtBlock" ADD COLUMN "dayOfWeek" INTEGER`); } catch {}
  try { await rawExec(prisma,`ALTER TABLE "CourtBlock" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true`); } catch {}
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "CourtBlock_courtId_dayOfWeek_idx" ON "CourtBlock"("courtId", "dayOfWeek")`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "HolidayRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 30000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "HolidayRate_date_key" ON "HolidayRate"("date")`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "CourtDateOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,"date" TEXT NOT NULL,"type" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Holiday',"reason" TEXT,"createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourtDateOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "CourtDateOverride_date_key" ON "CourtDateOverride"("date")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "CourtDateOverride_date_type_idx" ON "CourtDateOverride"("date","type")`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "BadmintonEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY, "studentId" TEXT NOT NULL, "studentName" TEXT NOT NULL,
    "phone" TEXT NOT NULL, "packageId" TEXT NOT NULL, "packageName" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL, "sessionsRemaining" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL, "expiryDate" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active',
    "renewalCount" INTEGER NOT NULL DEFAULT 0, "lastCheckIn" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "BadmintonEnrollment_studentId_idx" ON "BadmintonEnrollment"("studentId")`);
  try { await rawExec(prisma,`ALTER TABLE "BadmintonEnrollment" ADD COLUMN "lastCheckIn" TEXT`); } catch {}
  try { await rawExec(prisma,`ALTER TABLE "BadmintonEnrollment" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE`); } catch {}
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "BadmintonEnrollment_userId_idx" ON "BadmintonEnrollment"("userId")`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "BadmintonCheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY, "enrollmentId" TEXT NOT NULL, "date" TEXT NOT NULL,
    "time" TEXT NOT NULL, "sessionsUsed" INTEGER NOT NULL DEFAULT 1, "staffId" TEXT, "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BadmintonCheckIn_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "BadmintonEnrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "BadmintonCheckIn_enrollmentId_date_idx" ON "BadmintonCheckIn"("enrollmentId","date")`);
}

async function ensurePrivateCourseTables(){
  try { await rawExec(prisma,`ALTER TABLE "Coach" ADD COLUMN "department" TEXT NOT NULL DEFAULT 'Badminton'`); } catch {}
  await rawExec(prisma,`UPDATE "Coach" SET "department"='Gym' WHERE lower("specialty") LIKE '%gym%' AND lower("specialty") NOT LIKE '%badminton%'`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "PrivateCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,"title" TEXT NOT NULL,"description" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL DEFAULT 60,"price" INTEGER NOT NULL,"status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "PrivateCourse_status_title_idx" ON "PrivateCourse"("status","title")`);
  try { await rawExec(prisma,`ALTER TABLE "Booking" ADD COLUMN "reservationExpiresAt" DATETIME`); } catch {}
  try { await rawExec(prisma,`ALTER TABLE "Booking" ADD COLUMN "coachAcceptedAt" DATETIME`); } catch {}
  try { await rawExec(prisma,`ALTER TABLE "Booking" ADD COLUMN "paymentExpiresAt" DATETIME`); } catch {}
  await rawExec(prisma,`UPDATE "Booking" SET "coachAcceptedAt"=COALESCE("coachAcceptedAt","createdAt"),"paymentExpiresAt"=COALESCE("paymentExpiresAt","reservationExpiresAt",datetime("createdAt", '+24 hours')) WHERE "kind"='private_course' AND "status"='AWAITING_PAYMENT'`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Booking_userId_createdAt_idx" ON "Booking"("userId","createdAt")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Booking_courtId_date_status_idx" ON "Booking"("courtId","date","status")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Booking_coachId_date_status_idx" ON "Booking"("coachId","date","status")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Booking_privateCourse_paymentExpiresAt_idx" ON "Booking"("kind","status","paymentExpiresAt")`);
}

// Additive compatibility guard for existing local SQLite installs. The Prisma
// migration is canonical for deployments; this keeps older dev databases
// usable while the app starts.
async function ensureCentralUserIdentity(){
  const addColumnIfMissing=async(table:string,column:string,definition:string)=>{
    const cols=await rawQuery<any[]>(prisma,`PRAGMA table_info("${table}")`);
    if(!cols.some(c=>String(c.name)===column))await rawExec(prisma,`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  };
  await addColumnIfMissing("User","firebaseUid","TEXT");
  await addColumnIfMissing("User","emailVerified","BOOLEAN NOT NULL DEFAULT false");
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "User_firebaseUid_key" ON "User"("firebaseUid")`);
  await addColumnIfMissing("User","active","BOOLEAN NOT NULL DEFAULT true");
  await addColumnIfMissing("User","lastLoginAt","DATETIME");
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "Doctor" (
    "id" TEXT NOT NULL PRIMARY KEY,"userId" TEXT NOT NULL UNIQUE,
    "specialty" TEXT NOT NULL DEFAULT 'Physiotherapy & rehabilitation',"phone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',"color" TEXT NOT NULL DEFAULT '#79B4FF',"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Doctor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "BadmintonPackageCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,"name" TEXT NOT NULL UNIQUE,"active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BadmintonPackageCategory_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "BadmintonPackagePurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,"code" TEXT NOT NULL UNIQUE,"userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,"packageName" TEXT NOT NULL,"price" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'Pay at front desk',"status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"paidAt" DATETIME,
    CONSTRAINT "BadmintonPackagePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BadmintonPackagePurchase_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "BadmintonPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "PaymentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,"reference" TEXT NOT NULL UNIQUE,"userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,"resourceId" TEXT NOT NULL,"amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MMK',"provider" TEXT NOT NULL DEFAULT 'KPay',
    "providerReference" TEXT UNIQUE,"checkoutUrl" TEXT,"qrCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INITIATING',"expiresAt" DATETIME NOT NULL,"paidAt" DATETIME,
    "failureReason" TEXT,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "PaymentAttempt_userId_createdAt_idx" ON "PaymentAttempt"("userId","createdAt")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "PaymentAttempt_resourceType_resourceId_idx" ON "PaymentAttempt"("resourceType","resourceId")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status","expiresAt")`);
  await addColumnIfMissing("Coach","imageUrl",'TEXT');
  await addColumnIfMissing("PrivateCourse","imageUrl",'TEXT');
  await addColumnIfMissing("PrivateCourse","category",`TEXT NOT NULL DEFAULT 'Private Training'`);
  for(const [column,definition] of [["icon",'TEXT'],["imageUrl",'TEXT'],["actionLabel",'TEXT'],["entityType",'TEXT'],["entityId",'TEXT'],["activeInInbox",'BOOLEAN NOT NULL DEFAULT true']] as const)await addColumnIfMissing("Notification",column,definition);
  await rawExec(prisma,`CREATE TABLE IF NOT EXISTS "_PrivateCourseCoaches" (
    "A" TEXT NOT NULL,"B" TEXT NOT NULL,
    CONSTRAINT "_PrivateCourseCoaches_A_fkey" FOREIGN KEY ("A") REFERENCES "Coach"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PrivateCourseCoaches_B_fkey" FOREIGN KEY ("B") REFERENCES "PrivateCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "_PrivateCourseCoaches_AB_unique" ON "_PrivateCourseCoaches"("A","B")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "_PrivateCourseCoaches_B_idx" ON "_PrivateCourseCoaches"("B")`);
  const scheduleCols=await rawQuery<any[]>(prisma,`PRAGMA table_info("Schedule")`);
  if(scheduleCols.some(c=>String(c.name)==="coachId")){
    await rawExec(prisma,`CREATE TABLE "Schedule_new" (
      "id" TEXT NOT NULL PRIMARY KEY, "person" TEXT NOT NULL, "role" TEXT NOT NULL,
      "day" TEXT NOT NULL, "start" TEXT NOT NULL, "end" TEXT NOT NULL,
      "service" TEXT, "active" BOOLEAN NOT NULL DEFAULT true, "doctorId" TEXT,
      CONSTRAINT "Schedule_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`);
    await rawExec(prisma,`INSERT INTO "Schedule_new" ("id","person","role","day","start","end","service","active","doctorId")
      SELECT "id","person","role","day","start","end","service","active","doctorId" FROM "Schedule" WHERE "role"='doctor'`);
    await rawExec(prisma,`DROP TABLE "Schedule"`);
    await rawExec(prisma,`ALTER TABLE "Schedule_new" RENAME TO "Schedule"`);
  }
  await addColumnIfMissing("BadmintonEnrollment","purchaseId",'TEXT REFERENCES "BadmintonPackagePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "BadmintonEnrollment_purchaseId_key" ON "BadmintonEnrollment"("purchaseId")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "BadmintonPackagePurchase_userId_createdAt_idx" ON "BadmintonPackagePurchase"("userId","createdAt")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "BadmintonPackagePurchase_status_createdAt_idx" ON "BadmintonPackagePurchase"("status","createdAt")`);
  for(const [column,definition] of [["categoryId",'TEXT REFERENCES "BadmintonPackageCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE'],["availableDays",'JSONB'],["availableFrom",'TEXT'],["availableUntil",'TEXT'],["scheduleNotes",'TEXT'],["courtRules",'TEXT'],["imageUrl",'TEXT']] as const) await addColumnIfMissing("BadmintonPackage",column,definition);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "BadmintonPackage_categoryId_status_idx" ON "BadmintonPackage"("categoryId","status")`);
  await addColumnIfMissing("Coach","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Schedule","doctorId",'TEXT REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Appointment","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Appointment","doctorId",'TEXT REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Membership","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("Transaction","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await addColumnIfMissing("StoreOrder","userId",'TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
  await rawExec(prisma,`CREATE UNIQUE INDEX IF NOT EXISTS "Coach_userId_key" ON "Coach"("userId")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "User_role_active_idx" ON "User"("role","active")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Schedule_doctorId_idx" ON "Schedule"("doctorId")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Appointment_userId_date_idx" ON "Appointment"("userId","date")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Appointment_doctorId_date_idx" ON "Appointment"("doctorId","date")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Membership_userId_idx" ON "Membership"("userId")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" ON "Transaction"("userId","createdAt")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Transaction_userId_date_idx" ON "Transaction"("userId","date")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "Transaction_business_status_date_idx" ON "Transaction"("business","status","date")`);
  await rawExec(prisma,`CREATE INDEX IF NOT EXISTS "StoreOrder_userId_idx" ON "StoreOrder"("userId")`);
  await rawExec(prisma,`UPDATE "Coach" SET "userId"=(SELECT "id" FROM "User" WHERE lower("email")=lower("Coach"."email") AND "role"='coach' LIMIT 1) WHERE "userId" IS NULL AND EXISTS(SELECT 1 FROM "User" WHERE lower("email")=lower("Coach"."email") AND "role"='coach')`);
}

async function courtDateOverride(date:string){return prisma.courtDateOverride.findUnique({where:{date}})}

async function courtBlocks(date?: string, courtId?: string) {
  const dow = date ? new Date(`${date}T00:00:00`).getDay() : undefined;
  const override=date?await courtDateOverride(date):null;
  const recurring=date&&override?.type!=="open";
  const where = date && courtId
    ? `WHERE (cb.date = ? AND cb.active = 1${recurring?" OR (cb.dayOfWeek = ? AND cb.active = 1)":""}) AND cb.courtId = ?`
    : date
      ? `WHERE (cb.date = ? AND cb.active = 1${recurring?" OR (cb.dayOfWeek = ? AND cb.active = 1)":""})`
      : courtId
        ? `WHERE cb.courtId = ?`
        : ``;
  const params = date && courtId ? (recurring?[date,dow,courtId]:[date,courtId]) : date ? (recurring?[date,dow]:[date]) : courtId ? [courtId] : [];
  return rawQuery<any[]>(prisma,`SELECT cb.*, c.name as courtName FROM "CourtBlock" cb JOIN "Court" c ON c.id = cb.courtId ${where} ORDER BY cb.start ASC`, ...params);
}

async function holidayRate(date: string) {
  const rows=await rawQuery<any[]>(prisma,`SELECT * FROM "HolidayRate" WHERE date = ? LIMIT 1`, date);
  return rows[0] || null;
}


app.get("/api/health", (_req, res) => res.json({ ok: true, service: "zawana-api", time: new Date().toISOString() }));

// Authentication routes live in the auth domain router.
app.get("/api/profile",auth,asyncRoute(async(req:AuthRequest,res)=>res.json(toSafeAppUser(await prisma.user.findUniqueOrThrow({where:{id:req.user!.id}})))));
app.patch("/api/profile",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const body=z.object({name:z.string().trim().min(2).max(100).optional(),phone:z.string().trim().min(7).max(30).nullable().optional()}).strict().parse(req.body);
  if(body.phone){body.phone=body.phone.replace(/[\s().-]/g,"");if(!/^\+?\d{7,15}$/.test(body.phone))return res.status(400).json({message:"Enter a valid phone number."});}
  const updated=await prisma.user.update({where:{id:req.user!.id},data:body});
  res.json(toSafeAppUser(updated));
}));
app.post("/api/profile/avatar",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const body=z.object({image:z.string().min(1)}).parse(req.body);
  const avatar=await saveProfileImage(body.image,"profiles");
  const updated=await prisma.user.update({where:{id:req.user!.id},data:{avatar}});
  res.json({avatar:updated.avatar});
}));

// Users / members
async function syncManagedFirebaseIdentity(input:{userId:string;email:string;password?:string;name:string;firebaseUid?:string|null;disabled?:boolean}) {
  const auth=firebaseAdminAuth();
  const changes={
    displayName:input.name,
    emailVerified:true,
    ...(input.password?{password:input.password}:{}),
    ...(typeof input.disabled==="boolean"?{disabled:input.disabled}:{}),
  };
  if(input.firebaseUid)return auth.updateUser(input.firebaseUid,changes);
  try {
    const existing=await auth.getUserByEmail(input.email);
    const linkedUser=await prisma.user.findFirst({where:{firebaseUid:existing.uid},select:{id:true}});
    if(linkedUser&&linkedUser.id!==input.userId)throw Object.assign(new Error("This Firebase account is already linked to a different Zawana user."),{statusCode:409});
    return await auth.updateUser(existing.uid,changes);
  } catch(error:any) {
    if(error?.code!=="auth/user-not-found")throw error;
    return auth.createUser({email:input.email,...changes});
  }
}

app.get("/api/users",auth,roles("admin","owner"),asyncRoute(async(req,res)=>{
  const hasPage=typeof req.query.page!=="undefined",page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));
  const role=String(req.query.role||"all"),search=String(req.query.search||"").trim();
  if(role!=="all"&&!Object.values(Role).includes(role as Role))return res.status(400).json({message:"Choose a valid role filter."});
  const where:any={deletedAt:null,...(role!=="all"?{role:Role[role as keyof typeof Role]||"__invalid__"}:{}),...(search?{OR:[{name:{contains:search}},{email:{contains:search}},{phone:{contains:search}}]}:{})};
  const select={id:true,name:true,email:true,role:true,phone:true,membership:true,avatar:true,active:true,createdAt:true,lastLoginAt:true,coachProfile:{select:{id:true,department:true,imageUrl:true}},_count:{select:{bookings:true,notifications:true,badmintonEnrollments:true,appointments:true,transactions:true}}};
  if(!hasPage)return res.json(await prisma.user.findMany({where,select,orderBy:{createdAt:"desc"},take:100}));
  const [total,data,members,staff,active]=await Promise.all([prisma.user.count({where}),prisma.user.findMany({where,select,orderBy:{createdAt:"desc"},skip:(page-1)*limit,take:limit}),prisma.user.count({where:{AND:[where,{role:"member"}]}}),prisma.user.count({where:{AND:[where,{role:{not:"member"}}]}}),prisma.user.count({where:{AND:[where,{active:true}]}})]);
  const totalPages=Math.ceil(total/limit);
  res.json({data,pagination:{page,limit,total,totalPages,hasNextPage:page<totalPages,hasPreviousPage:page>1&&total>0},summary:{members,staff,active}});
}));
app.post("/api/users",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string().min(2),email:z.string().email(),password:z.string().min(8),phone:z.string().optional(),role:z.nativeEnum(Role),coachDepartment:z.enum(["Badminton","Gym"]).optional()}).parse(req.body);
  const email=b.email.toLowerCase();
  if(await prisma.user.findUnique({where:{email},select:{id:true}}))return res.status(409).json({message:"A Zawana account with this email already exists."});
  const passwordHash=await bcrypt.hash(b.password,12);
  const firebaseMode=!env.databaseAuthEnabled;
  let identity:null|Awaited<ReturnType<ReturnType<typeof firebaseAdminAuth>["createUser"]>>=null;
  if(firebaseMode){
    try{identity=await firebaseAdminAuth().createUser({email,password:b.password,displayName:b.name,emailVerified:true});}
    catch(error:any){
      if(error?.code==="auth/email-already-exists")throw Object.assign(new Error("This email already has a Firebase sign-in account. Link that account to its existing Zawana user or choose another email."),{statusCode:409});
      throw error;
    }
  }
  let created;
  try {
    created=await prisma.$transaction(async tx=>{
      const user=await tx.user.create({data:{name:b.name,email,passwordHash,phone:b.phone||null,role:b.role,...(identity?{firebaseUid:identity.uid,emailVerified:true}:{})}});
      const coach=b.role==="coach"?await tx.coach.create({data:{name:b.name,email,specialty:b.coachDepartment||"Badminton",department:b.coachDepartment||"Badminton",phone:b.phone||"",userId:user.id}}):null;
      if(b.role==="doctor")await tx.doctor.create({data:{userId:user.id,phone:b.phone||""}});
      return {user,coach};
    });
  } catch(error) {
    if(identity)await firebaseAdminAuth().deleteUser(identity.uid).catch(()=>undefined);
    throw error;
  }
  res.status(201).json({id:created.user.id,name:created.user.name,email:created.user.email,role:created.user.role,phone:created.user.phone,active:created.user.active,createdAt:created.user.createdAt,coachId:created.coach?.id||null});
}));
app.patch("/api/users/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const body=z.object({name:z.string().min(2).optional(),phone:z.string().nullable().optional(),role:z.nativeEnum(Role).optional(),membership:z.string().nullable().optional(),active:z.boolean().optional(),password:z.string().min(8).optional(),coachDepartment:z.enum(["Badminton","Gym"]).optional()}).parse(req.body);
  if(req.params.id===req.user!.id&&body.active===false)return res.status(400).json({message:"You cannot deactivate your own admin account."});
  const current=await prisma.user.findUnique({where:{id:String(req.params.id)}});
  if(!current||current.deletedAt)return res.status(404).json({message:"User not found."});
  let linkedFirebaseUid=current.firebaseUid;
  let newlyCreatedFirebaseUid:string|undefined;
  if(!env.databaseAuthEnabled&&(body.password||typeof body.active==="boolean")){
    const auth=firebaseAdminAuth();
    if(linkedFirebaseUid){
      await auth.updateUser(linkedFirebaseUid,{...(body.password?{password:body.password}:{}),...(typeof body.active==="boolean"?{disabled:!body.active}:{})});
    }else if(body.password){
      const identity=await syncManagedFirebaseIdentity({userId:current.id,email:current.email,password:body.password,name:body.name||current.name,disabled:body.active===undefined?!current.active:!body.active});
      linkedFirebaseUid=identity.uid;
      newlyCreatedFirebaseUid=identity.uid;
    }
  }
  const data:any={...body};delete data.coachDepartment;if(body.password){data.passwordHash=await bcrypt.hash(body.password,12);delete data.password;}
  if(linkedFirebaseUid)data.firebaseUid=linkedFirebaseUid;
  if(linkedFirebaseUid&&!env.databaseAuthEnabled)data.emailVerified=true;
  let updated;
  try{updated=await prisma.$transaction(async tx=>{
    const user=await tx.user.update({where:{id:req.params.id},data,select:{id:true,name:true,email:true,role:true,phone:true,membership:true,active:true,createdAt:true,lastLoginAt:true}});
    if(user.role==="coach"){
      const existing=await tx.coach.findFirst({where:{OR:[{userId:user.id},{email:user.email}]}});
      if(body.coachDepartment==="Gym"&&existing&&await tx.privateCourse.count({where:{status:"active",coaches:{some:{id:existing.id}}}}))throw Object.assign(new Error("Remove this coach from active badminton courses before changing the department."),{statusCode:409});
      if(existing)await tx.coach.update({where:{id:existing.id},data:{userId:user.id,name:user.name,email:user.email,phone:user.phone||"",status:user.active?"active":"inactive",...(body.coachDepartment?{department:body.coachDepartment,specialty:body.coachDepartment}:{})}});
      else await tx.coach.create({data:{userId:user.id,name:user.name,email:user.email,phone:user.phone||"",specialty:body.coachDepartment||"Badminton",department:body.coachDepartment||"Badminton",status:user.active?"active":"inactive"}});
    } else if(body.role) await tx.coach.updateMany({where:{userId:user.id},data:{status:"inactive"}});
    if(user.role==="doctor"){
      const existing=await tx.doctor.findUnique({where:{userId:user.id}});
      if(existing)await tx.doctor.update({where:{userId:user.id},data:{phone:user.phone||"",status:user.active?"active":"inactive"}});
      else await tx.doctor.create({data:{userId:user.id,phone:user.phone||"",status:user.active?"active":"inactive"}});
    } else if(body.role) await tx.doctor.updateMany({where:{userId:user.id},data:{status:"inactive"}});
    return user;
  });}catch(error){if(newlyCreatedFirebaseUid)await firebaseAdminAuth().deleteUser(newlyCreatedFirebaseUid).catch(()=>undefined);throw error;}
  res.json(updated);
}));
app.delete("/api/users/:id",auth,roles("admin"),asyncRoute(async(req:AuthRequest,res)=>{
  const id=String(req.params.id);
  const body=z.object({confirmationName:z.string().min(1,"Type the account name to confirm deletion.")}).parse(req.body);
  if(id===req.user!.id)return res.status(400).json({message:"You cannot delete your own admin account."});
  const user=await prisma.user.findUnique({where:{id}});
  if(!user||user.deletedAt)return res.status(404).json({message:"User not found."});
  if(body.confirmationName!==user.name)return res.status(400).json({message:"The name does not match this account. Check the spelling and try again."});
  let firebaseStateChanged=false;
  if(user.firebaseUid&&!env.databaseAuthEnabled){
    try{
      const firebaseAuth=firebaseAdminAuth();
      const identity=await firebaseAuth.getUser(user.firebaseUid);
      if(!identity.disabled){
        await firebaseAuth.updateUser(user.firebaseUid,{disabled:true});
        firebaseStateChanged=true;
      }
    }catch(error:any){
      if(error?.code!=="auth/user-not-found"){
        console.error("Could not disable Firebase identity during user deletion",{userId:id,code:error?.code||"unknown"});
        throw Object.assign(new Error("The linked Firebase account could not be disabled. The Zawana account was not deleted. Check the Firebase Admin credentials and permissions."),{statusCode:503});
      }
    }
  }
  try{
    await prisma.$transaction(async tx=>{
      const deleted=await tx.user.updateMany({where:{id,deletedAt:null},data:{active:false,deletedAt:new Date()}});
      if(!deleted.count)throw Object.assign(new Error("This account has already been deleted."),{statusCode:409});
      await tx.coach.updateMany({where:{userId:id},data:{status:"inactive"}});
      await tx.doctor.updateMany({where:{userId:id},data:{status:"inactive"}});
    });
  }catch(error){
    if(firebaseStateChanged&&user.active&&user.firebaseUid){
      const current=await prisma.user.findUnique({where:{id},select:{deletedAt:true}}).catch(()=>null);
      if(current&&!current.deletedAt)await firebaseAdminAuth().updateUser(user.firebaseUid,{disabled:false}).catch(rollbackError=>console.error("Failed to restore Firebase identity after user deletion rollback",{userId:id,code:(rollbackError as any)?.code||"unknown"}));
    }
    throw error;
  }
  res.status(204).end();
}));
app.get("/api/users/:id/activity",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const user=await prisma.user.findUnique({where:{id:String(req.params.id)},include:{bookings:{include:{court:true,coach:true},orderBy:{createdAt:"desc"},take:50},badmintonEnrollments:{include:{checkIns:{orderBy:{createdAt:"desc"},take:30}},orderBy:{createdAt:"desc"},take:30},appointments:{orderBy:{date:"desc"},take:30},transactions:{orderBy:{createdAt:"desc"},take:50},memberships:{take:30},storeOrders:{take:30}}});
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
app.get("/api/coaches",auth,roles("admin","owner","gym_fo","badminton_fo","member"),asyncRoute(async(req:AuthRequest,res)=>{
  const where:any=["admin","owner"].includes(req.user!.role)?{}:{department:req.user!.role==="gym_fo"?"Gym":req.user!.role==="member"?"Gym":"Badminton",status:"active",user:{is:{active:true,role:"coach"}}};
  res.json(await prisma.coach.findMany({where,include:{user:{select:{id:true,name:true,email:true,active:true,avatar:true}}},orderBy:{name:"asc"},take:200}));
}));
app.post("/api/coaches",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string(),specialty:z.string(),department:z.enum(["Badminton","Gym"]).default("Badminton"),phone:z.string(),email:z.string().email(),status:z.enum(["active","inactive"]).optional(),color:z.string().optional(),imageUrl:z.string().max(2048).refine(isStoredImageUrl,"Choose an uploaded image URL.").nullable().optional()}).parse(req.body);
  const user=await prisma.user.findFirst({where:{email:b.email.toLowerCase(),role:"coach",active:true}});
  if(!user)return res.status(400).json({message:"Create or select an active Coach user account first, then link this profile to its email."});
  res.status(201).json(await prisma.coach.create({data:{...b,email:user.email,userId:user.id,status:b.status||"active",color:b.color||"#D6FF3F"}}));
}));
app.patch("/api/coaches/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({name:z.string().optional(),specialty:z.string().optional(),department:z.enum(["Badminton","Gym"]).optional(),phone:z.string().optional(),email:z.string().email().optional(),status:z.enum(["active","inactive"]).optional(),color:z.string().optional(),imageUrl:z.string().max(2048).refine(isStoredImageUrl,"Choose an uploaded image URL.").nullable().optional()}).parse(req.body);
  if(b.department==="Gym"&&await prisma.privateCourse.count({where:{status:"active",coaches:{some:{id:String(req.params.id)}}}}))return res.status(409).json({message:"Remove this coach from active badminton courses before changing the department."});
  let data:any={...b};
  if(b.email){const user=await prisma.user.findFirst({where:{email:b.email.toLowerCase(),role:"coach",active:true}});if(!user)return res.status(400).json({message:"Select an active Coach user account email."});data.email=user.email;data.userId=user.id;}
  res.json(await prisma.coach.update({where:{id:req.params.id},data}));
}));
async function saveProfileImage(dataUrl:string,folder:string){
  const match=dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw Object.assign(new Error("Upload a PNG, JPG, or WebP image."),{statusCode:400});
  const bytes=Buffer.from(match[2],"base64");if(!bytes.length||bytes.length>5*1024*1024)throw Object.assign(new Error("Profile images must be 5 MB or smaller."),{statusCode:400});
  const signatures:Record<string,boolean>={png:bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg:bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217,webp:bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP"};
  if(!signatures[match[1]])throw Object.assign(new Error("Image data did not match the selected file type."),{statusCode:400});
  const ext=match[1]==="jpeg"?"jpg":match[1],name=`${crypto.randomUUID()}.${ext}`,root=folder==="coaches"?coachUploadPath:folder==="profiles"?profileUploadPath:courseUploadPath;await mkdir(root,{recursive:true});await writeFile(path.join(root,name),bytes);return `${publicApiUrl()}/uploads/${folder}/${name}`;
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
  if(!["admin","clinic_fo","doctor"].includes(req.user!.role))return res.json([]);
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
app.get("/api/bookings/availability",auth,roles("member","admin","badminton_fo"),asyncRoute(async(req,res)=>{
  await expirePrivateCourseReservations();
  const date=String(req.query.date||today()); const courtId=String(req.query.courtId||"");
  if(!isDateKey(date))return res.status(400).json({message:"Choose a valid booking date."});
  const [bookings,blocks,holiday,dateOverride]=await Promise.all([
    prisma.booking.findMany({where:{date,status:{in:["pending","confirmed","CONFIRMED","PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"]},...(courtId?{courtId}: {})},select:{id:true,date:true,time:true,courtId:true,coachId:true,status:true}}),
    courtBlocks(date,courtId),
    holidayRate(date),courtDateOverride(date)
  ]);
  res.json({bookings,blocks,holiday,dateOverride,closed:dateOverride?.type==="closed"});
}));

app.get("/api/bookings/month-availability",auth,roles("member","admin","badminton_fo"),asyncRoute(async(req,res)=>{
  await expirePrivateCourseReservations();
  const month=String(req.query.month||"");
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({message:"Month must use YYYY-MM format."});
  const year=Number(month.slice(0,4)),monthNo=Number(month.slice(5,7));
  const start=`${month}-01`,end=`${month}-${String(new Date(year,monthNo,0).getDate()).padStart(2,"0")}`;
  const [courts,bookings,blocks,holidays,overrides]=await Promise.all([
    prisma.court.findMany({where:{status:{not:"inactive"}},orderBy:{name:"asc"}}),
    prisma.booking.findMany({where:{date:{gte:start,lte:end},status:{in:occupyingStatuses}},select:{date:true,time:true,courtId:true,status:true}}),
    prisma.courtBlock.findMany({where:{active:true,OR:[{date:{gte:start,lte:end}},{dayOfWeek:{not:null}}]},select:{date:true,dayOfWeek:true,start:true,end:true,courtId:true,active:true}}),
    prisma.holidayRate.findMany({where:{date:{gte:start,lte:end},active:true},select:{date:true,title:true,price:true,active:true}}),
    prisma.courtDateOverride.findMany({where:{date:{gte:start,lte:end}}})
  ]);
  res.json({courts,bookings,blocks,holidays,overrides});
}));

app.get("/api/badminton/date-overrides",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const start=String(req.query.start||"0000-01-01"),end=String(req.query.end||"9999-12-31");
  res.json(await prisma.courtDateOverride.findMany({where:{date:{gte:start,lte:end}},orderBy:{date:"asc"}}));
}));
app.put("/api/badminton/date-overrides/:date",auth,roles("admin","badminton_fo"),asyncRoute(async(req:AuthRequest,res)=>{
  const date=String(req.params.date);
  if(!isDateKey(date))return res.status(400).json({message:"Choose a valid date."});
  const body=z.object({type:z.enum(["open","closed"]),title:z.string().trim().min(1).max(80).default("Holiday"),reason:z.string().trim().max(240).optional()}).parse(req.body);
  const item=await prisma.courtDateOverride.upsert({where:{date},create:{date,...body,createdById:req.user!.id},update:body});
  res.json(item);
}));
app.delete("/api/badminton/date-overrides/:date",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const date=String(req.params.date);if(!isDateKey(date))return res.status(400).json({message:"Choose a valid date."});
  await prisma.courtDateOverride.deleteMany({where:{date}});res.status(204).end();
}));

// Booking list and member filter routes are isolated from the transaction-heavy booking workflow.
registerBookingQueryRoutes({app,prisma,auth,memberOnly:roles("member"),asyncRoute,expireReservations:expirePrivateCourseReservations,today});
app.post("/api/bookings",auth,asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const b=z.object({kind:z.enum(["court","class","pt","recovery"]),title:z.string().optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),time:z.string().optional(),slots:z.array(z.object({courtId:z.string().min(1),time:z.string().min(1)})).min(1).max(60).optional(),bookings:z.array(z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),courtId:z.string().min(1),time:z.string().min(1)})).min(1).max(60).optional(),location:z.string().optional(),price:z.number().int().nonnegative().optional(),courtId:z.string().optional(),coachId:z.string().optional(),meta:z.string().optional(),paymentStatus:z.enum(["pending","paid","refunded"]).optional()}).parse(req.body);
  const toMin=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1],mi=+m[2];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+mi};
  const range=(v:string)=>{const p=v.split(/\s*(?:—|–|-)\s*/);if(p.length!==2)return null;const a=toMin(p[0]),e=toMin(p[1]);return Number.isFinite(a)&&Number.isFinite(e)?{start:a,end:e}:null};
  const overlaps=(a:string,b:string)=>{const x=range(a),y=range(b);return !!x&&!!y&&x.start<y.end&&y.start<x.end};
  if(b.kind==="court"){
    const requested=(b.bookings||b.slots?.map(s=>({date:b.date||"",...s}))||((b.courtId&&b.time&&b.date)?[{date:b.date,courtId:b.courtId,time:b.time}]:[]));
    if(!requested.length)return res.status(400).json({message:"Choose at least one court and time slot."});
    const invalidDates=requested.filter(s=>!isDateKey(s.date));
    if(invalidDates.length)return res.status(400).json({message:"Each booking must have a valid date."});
    if(requested.some(s=>s.date<today()))return res.status(400).json({message:"Choose today or a future date for every session."});
    const ids=[...new Set(requested.map(s=>s.courtId))],courts=await prisma.court.findMany({where:{id:{in:ids}}}),courtById=new Map(courts.map(c=>[c.id,c]));
    const invalid:any[]=[],seen:any[]=[];
    for(const item of requested){const r=range(item.time),court=courtById.get(item.courtId);let reason="";
      if(!r||r.end-r.start!==60||r.start<360||r.end>1260||r.start%60!==0)reason="Choose one-hour slots between 6:00 AM and 9:00 PM.";
      else if(item.date===today()&&r.start<=businessNow().hour*60+businessNow().minute)reason="This time has already passed.";
      else if(!court)reason="Court not found.";else if(court.status!=="available")reason=`${court.name} is currently ${court.status}.`;
      else if(seen.some(s=>s.date===item.date&&s.courtId===item.courtId&&s.time===item.time))reason="This slot is selected more than once.";
      else if(seen.some(s=>s.date===item.date&&s.courtId===item.courtId&&overlaps(s.time,item.time)))reason="The selected slots overlap.";
      if(reason)invalid.push({...item,courtName:court?.name||item.courtId,reason});seen.push(item);
    }
    if(invalid.length)return res.status(409).json({message:"Review the unavailable slot(s) and try again.",conflicts:invalid});
    const created=await prisma.$transaction(async tx=>{
      for(const id of [...ids].sort())await rawExec(tx,`UPDATE "Court" SET status=status WHERE id=?`,id);
      const dates=[...new Set(requested.map(s=>s.date))];
      const [overrides,currentCourts,existing,blocks,holidays]=await Promise.all([
        tx.courtDateOverride.findMany({where:{date:{in:dates}}}),
        tx.court.findMany({where:{id:{in:ids}}}),
        tx.booking.findMany({where:{date:{in:dates},courtId:{in:ids},status:{in:occupyingStatuses}},select:{date:true,courtId:true,time:true}}),
        tx.courtBlock.findMany({where:{courtId:{in:ids},active:true,OR:[{date:{in:dates}},{dayOfWeek:{not:null}}]}}),
        tx.holidayRate.findMany({where:{date:{in:dates},active:true}})
      ]);
      const currentById=new Map(currentCourts.map(c=>[c.id,c])),overrideByDate=new Map(overrides.map(x=>[x.date,x])),holidayByDate=new Map(holidays.map(x=>[x.date,x])),conflicts:any[]=[];
      for(const item of requested){const r=range(item.time),court=currentById.get(item.courtId);
        const override=overrideByDate.get(item.date),dow=new Date(`${item.date}T00:00:00`).getDay();
        const dateBlocks=blocks.filter(x=>x.courtId===item.courtId&&(x.date===item.date||(override?.type!=="open"&&x.dayOfWeek===dow)));
        let reason="";
        if(override?.type==="closed")reason=`Courts are closed on ${item.date}.`;
        else if(!court||court.status!=="available")reason=court?`${court.name} is no longer available.`:"Court is no longer available.";
        else if(r&&item.date===today()&&r.start<=businessNow().hour*60+businessNow().minute)reason="This time has already passed.";
        else if(existing.some(x=>x.date===item.date&&x.courtId===item.courtId&&overlaps(x.time,item.time)))reason="This slot was just booked by someone else.";
        else if(dateBlocks.some(x=>overlaps(`${x.start} — ${x.end}`,item.time)))reason="This slot is reserved for a class or facility block.";
        if(reason)conflicts.push({...item,courtName:court?.name||item.courtId,reason});
      }
      if(conflicts.length)throw Object.assign(new Error("One or more selected slots are no longer available. No bookings were created."),{statusCode:409,conflicts});
      const rows=[];
      for(const item of requested){const court=currentById.get(item.courtId)!,r=range(item.time)!,holiday=holidayByDate.get(item.date);
        const price=holiday?holiday.price:court.price+(r.start>=900?5000:0);
        const row=await tx.booking.create({data:{kind:"court",title:court.name,date:item.date,time:item.time,location:b.location||"Zawana Badminton Arena",courtId:court.id,price,code:code("ZW"),userId:req.user!.id,status:"CONFIRMED",paymentStatus:"pending",reservationExpiresAt:null}});
        await tx.notification.create({data:{userId:req.user!.id,title:"Court booking confirmed",body:`${court.name} · ${item.date} · ${item.time}.`,link:"/bookings",audience:"member",type:"booking",icon:"calendar",entityType:"booking",entityId:row.id}});
        await tx.notification.create({data:{userId:null,title:"New court booking",body:`${req.user!.name} · ${court.name} · ${item.date} · ${item.time}.`,link:"/badminton-fo/bookings",audience:"badminton_fo",type:"booking",icon:"calendar",actionLabel:"View bookings",entityType:"booking",entityId:row.id}});
        await tx.notification.create({data:{userId:null,title:"New badminton booking",body:`${req.user!.name} · ${court.name} · ${item.date} · ${item.time}.`,link:"/admin/bookings",audience:"admin",type:"booking",icon:"calendar",actionLabel:"View bookings",entityType:"booking",entityId:row.id}});
        rows.push(row);
      }
      return rows;
    });
    return res.status(201).json({booking:created[0],bookings:created,totalPrice:created.reduce((sum,row)=>sum+row.price,0)});
  }
  if(!b.date||!isDateKey(b.date))return res.status(400).json({message:"Choose a valid booking date."});
  if(b.kind!=="pt")return res.status(400).json({message:"Choose a supported booking type."});
  if(!b.coachId)return res.status(400).json({message:"Select a coach."});
  const coach=await prisma.coach.findFirst({where:{id:b.coachId,department:"Gym",status:"active",user:{is:{active:true,role:"coach"}}}});if(!coach)return res.status(409).json({message:"This gym coach is unavailable."});
  const booked=await prisma.booking.findMany({where:{date:b.date,coachId:b.coachId,status:{in:occupyingStatuses}},select:{time:true}});
  const trainingMinute=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]};
  if(!b.time)return res.status(400).json({message:"Choose a training time."});
  const spans=(v:string)=>{const p=v.split(/\s*(?:—|–|-|to)\s*/i);return p.length===2?[trainingMinute(p[0]),trainingMinute(p[1])]:[NaN,NaN]};const wanted=spans(b.time);if(!Number.isFinite(wanted[0])||wanted[1]<=wanted[0])return res.status(400).json({message:"Choose a valid training time."});
  if(booked.some(x=>{const r=spans(x.time);return wanted[0]<r[1]&&r[0]<wanted[1]}))return res.status(409).json({message:"That coach is already booked at this time."});
  const booking=await prisma.booking.create({data:{kind:"pt",title:b.title||"Personal training",date:b.date,time:b.time,location:b.location||"Zawana",coachId:coach.id,price:30000,code:code("PT"),userId:req.user!.id,status:"CONFIRMED",paymentStatus:"pending"}});
  res.status(201).json({booking});
}));

app.patch("/api/bookings/:id",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const existing=await prisma.booking.findUnique({where:{id:String(req.params.id)}}); if(!existing)return res.status(404).json({message:"Booking not found"});
  if(!["admin","gym_fo","badminton_fo"].includes(req.user!.role))return res.status(403).json({message:"Booking edits are limited to facility staff. Members may cancel their own booking."});
  if(existing.kind==="private_course")return res.status(403).json({message:"Private course status is managed through its booking workflow."});
  const b=z.object({title:z.string().optional(),date:z.string().optional(),time:z.string().optional(),location:z.string().optional(),price:z.number().int().nonnegative().optional(),paymentStatus:z.enum(["pending","paid","refunded"]).optional(),status:z.nativeEnum(BookingStatus).optional()}).parse(req.body);
  if(existing.kind==="court"){const time=b.time||existing.time; const date=b.date||existing.date; const p=time.split(/\s*(?:—|–|-)\s*/); const mins=(x:string)=>{const m=x.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]}; if(p.length!==2||mins(p[1])-mins(p[0])!==60||mins(p[0])<360||mins(p[1])>1260)return res.status(400).json({message:"Court bookings must be one hour between 6:00 AM and 9:00 PM."}); const conflicts=await prisma.booking.findMany({where:{id:{not:existing.id},date,courtId:existing.courtId!,status:{in:["pending","confirmed"]}},select:{time:true}}); const overlap=(a:string)=>{const x=a.split(/\s*(?:—|–|-)\s*/);return x.length===2&&mins(x[0])<mins(p[1])&&mins(p[0])<mins(x[1])}; if(conflicts.some(x=>overlap(x.time)))return res.status(409).json({message:"That court/time is already booked."}); const blocks=await courtBlocks(date,existing.courtId!); if(blocks.some(x=>overlap(`${x.start} — ${x.end}`)))return res.status(409).json({message:"That court/time is reserved for a class."});}
  res.json(await prisma.booking.update({where:{id:existing.id},data:b}));
}));
app.delete("/api/bookings/:id",auth,roles("admin","gym_fo","badminton_fo"),asyncRoute(async(req:AuthRequest,res)=>{const existing=await prisma.booking.findUnique({where:{id:String(req.params.id)}});if(!existing)return res.status(404).json({message:"Booking not found"});if(existing.kind==="private_course")return res.status(409).json({message:"Private course history is preserved. Cancel the booking instead."});await prisma.booking.update({where:{id:existing.id},data:{status:"cancelled"}});res.status(204).end();}));

app.patch("/api/bookings/:id/status",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({status:z.nativeEnum(BookingStatus)}).parse(req.body);
  const existing=await prisma.booking.findUnique({where:{id:String(req.params.id)}});
  if(!existing) return res.status(404).json({message:"Booking not found"});
  if(!["admin","gym_fo","badminton_fo"].includes(req.user!.role)) {
    if(req.user!.role!=="member"||existing.userId!==req.user!.id||b.status!=="cancelled"||existing.kind==="private_course") return res.status(403).json({message:"Members may only cancel their own standard bookings."});
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
  const existing=await rawQuery<any[]>(prisma,`SELECT * FROM "CourtBlock" WHERE courtId=? AND dayOfWeek=? AND active=1`,b.courtId,b.dayOfWeek);
  const exact=existing.find(x=>x.start===b.start&&x.end===b.end);
  if(exact){
    return res.json((await rawQuery<any[]>(prisma,`SELECT cb.*, c.name as courtName FROM "CourtBlock" cb JOIN "Court" c ON c.id=cb.courtId WHERE cb.id=?`,exact.id))[0]);
  }
  if(existing.some(x=>m(x.start)<m(b.end)&&m(b.start)<m(x.end)))return res.status(409).json({message:"That court already has a different weekly reservation overlapping this time."});
  const dayDates:any[]=[];
  const now=new Date();
  for(let i=0;i<7;i++){const d=new Date(now);d.setDate(now.getDate()+i);if(d.getDay()===b.dayOfWeek)dayDates.push(d.toISOString().slice(0,10));}
  if(dayDates.length){const conflicts=await prisma.booking.findMany({where:{courtId:b.courtId,date:{in:dayDates},status:{in:["pending","confirmed"]}},select:{date:true,time:true}});const range=(x:string)=>{const p=x.split(/\s*(?:—|–|-)\s*/);const parse=(v:string)=>{const q=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!q)return NaN;let h=+q[1];if(h===12)h=0;if(q[3].toUpperCase()==="PM")h+=12;return h*60+ +q[2]};return p.length===2?[parse(p[0]),parse(p[1])]:[NaN,NaN]};if(conflicts.some(x=>{const r=range(x.time);return r[0]<m(b.end)&&m(b.start)<r[1]}))return res.status(409).json({message:"A booking already exists in the selected weekly time."});}
  const id=code("CB");
  await rawExec(prisma,`INSERT INTO "CourtBlock" (id,courtId,date,start,end,title,type,note,dayOfWeek,active) VALUES (?,?,?,?,?,?,?,?,?,?)`,id,b.courtId,"",b.start,b.end,b.title,b.type,b.note||null,b.dayOfWeek,b.active!==false?(sqliteDatabase?1:true):(sqliteDatabase?0:false));
  res.status(201).json((await courtBlocks(undefined,b.courtId)).find((x:any)=>x.id===id));
}));
app.patch("/api/court-blocks/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({dayOfWeek:z.coerce.number().int().min(0).max(6).optional(),start:z.string().regex(/^\d{2}:\d{2}$/).optional(),end:z.string().regex(/^\d{2}:\d{2}$/).optional(),title:z.string().min(1).optional(),type:z.string().optional(),note:z.string().optional(),active:z.boolean().optional()}).parse(req.body);
  const current=(await rawQuery<any[]>(prisma,`SELECT * FROM "CourtBlock" WHERE id=?`,req.params.id))[0];if(!current)return res.status(404).json({message:"Court block not found"});
  const day=b.dayOfWeek??current.dayOfWeek,startTime=b.start??current.start,endTime=b.end??current.end;const m=(x:string)=>{const p=x.split(":");return +p[0]*60+ +p[1]};if(m(endTime)-m(startTime)!==60||m(startTime)<360||m(endTime)>1260)return res.status(400).json({message:"Class reservations must be one hour between 6:00 AM and 9:00 PM."});
  const sets:string[]=[];const vals:any[]=[];for(const [k,v] of Object.entries({...b,dayOfWeek:day,start:startTime,end:endTime})){if(v!==undefined){sets.push(`"${k}" = ?`);vals.push(v)}}if(!sets.length)return res.status(400).json({message:"No changes supplied"});vals.push(req.params.id);await rawExec(prisma,`UPDATE "CourtBlock" SET ${sets.join(", ")} WHERE id = ?`,...vals);res.json((await rawQuery<any[]>(prisma,`SELECT cb.*, c.name as courtName FROM "CourtBlock" cb JOIN "Court" c ON c.id=cb.courtId WHERE cb.id=?`,req.params.id))[0]);
}));
app.delete("/api/court-blocks/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{const rows=await rawQuery<any[]>(prisma,`SELECT id FROM "CourtBlock" WHERE id=?`,req.params.id);if(!rows[0])return res.status(404).json({message:"Court block not found"});await rawExec(prisma,`DELETE FROM "CourtBlock" WHERE id = ?`,req.params.id);res.status(204).end()}));

app.get("/api/dashboard",auth,asyncRoute(async(req:AuthRequest,res)=>{
  if(!["admin","owner","badminton_fo"].includes(req.user!.role))return res.status(403).json({message:"Insufficient permissions"});
  const day=today();
  if(req.user!.role==="badminton_fo"){
    const [bookingsToday,bookingsUpcoming,activePackages,walkIns,checkInsToday,availableCourts,revenue]=await Promise.all([
      prisma.booking.count({where:{kind:"court",date:day,status:{notIn:["CANCELLED","cancelled"]}}}),
      prisma.booking.count({where:{kind:"court",date:{gte:day},status:{notIn:["CANCELLED","cancelled"]}}}),
      prisma.badmintonEnrollment.count({where:{status:"active",expiryDate:{gte:day},sessionsRemaining:{gt:0}}}),
      prisma.badmintonEnrollment.count({where:{userId:null,status:"active",expiryDate:{gte:day},sessionsRemaining:{gt:0}}}),
      prisma.badmintonCheckIn.count({where:{date:day}}),
      prisma.court.count({where:{status:"available"}}),
      prisma.transaction.aggregate({where:{business:"Badminton",date:day,status:"paid"},_sum:{finalAmount:true}})
    ]);
    return res.json({bookingsToday,bookingsUpcoming,activePackages,walkIns,checkInsToday,availableCourts,revenueToday:revenue._sum.finalAmount||0});
  }
  const [members,bookingsToday,revenue,activeCourts,coaches,staff,products,transactionsToday]=await Promise.all([
    prisma.user.count({where:{role:"member"}}),
    prisma.booking.count({where:{date:day,status:{in:["pending","confirmed","CONFIRMED","PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT"]}}}),
    prisma.transaction.aggregate({where:{status:"paid"},_sum:{finalAmount:true}}),
    prisma.court.count({where:{status:"available"}}),
    prisma.coach.count({where:{status:"active"}}),
    prisma.user.count({where:{active:true,role:{not:"member"}}}),
    prisma.product.count({where:{stock:{lte:5},status:"active"}}),
    prisma.transaction.aggregate({where:{status:"paid",date:day},_sum:{finalAmount:true}})
  ]);
  res.json({members,bookingsToday,revenue:revenue._sum.finalAmount||0,activeCourts,coaches,staff,lowStock:products,revenueToday:transactionsToday._sum.finalAmount||0});
}));

// Packages
app.get("/api/packages/badminton",auth,asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackage.findMany({where:["admin","owner","badminton_fo"].includes(req.user!.role)?{}:{status:{in:["active","coming_soon"]}},include:{category:true},orderBy:{title:"asc"}}))));
app.get("/api/packages/badminton/categories",auth,asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackageCategory.findMany({where:["admin","owner","badminton_fo"].includes(req.user!.role)?{}:{active:true},orderBy:{name:"asc"}}))));
app.post("/api/packages/badminton/categories",auth,roles("admin"),asyncRoute(async(req:AuthRequest,res)=>{const name=String(req.body.name||"").trim();if(!name)return res.status(400).json({message:"Category name is required."});res.status(201).json(await prisma.badmintonPackageCategory.create({data:{name,createdBy:req.user!.id}}))}));
app.patch("/api/packages/badminton/categories/:id",auth,roles("admin"),asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackageCategory.update({where:{id:req.params.id},data:{name:req.body.name,active:req.body.active}}))));
const badmintonPackageInput=z.object({title:z.string().trim().min(2).max(120),price:z.coerce.number().int().nonnegative(),sessions:z.coerce.number().int().positive(),validity:z.coerce.number().int().positive(),description:z.string().default(""),status:z.enum(["active","inactive","coming_soon"]).default("active"),categoryId:z.string().nullable().optional(),availableDays:z.array(z.string()).optional(),availableFrom:z.string().nullable().optional(),availableUntil:z.string().nullable().optional(),scheduleNotes:z.string().nullable().optional(),courtRules:z.string().nullable().optional(),imageUrl:z.string().nullable().optional()});
app.post("/api/packages/badminton",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.badmintonPackage.create({data:badmintonPackageInput.parse(req.body)}))));
app.patch("/api/packages/badminton/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>res.json(await prisma.badmintonPackage.update({where:{id:req.params.id},data:badmintonPackageInput.partial().parse(req.body)}))));
app.delete("/api/packages/badminton/:id",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{await prisma.badmintonPackage.delete({where:{id:req.params.id}});res.status(204).end()}));
app.get("/api/packages/gym",auth,roles("admin","owner","gym_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.gymPackage.findMany({orderBy:{title:"asc"}}))));
const gymPackageInput=z.object({title:z.string().trim().min(2).max(120),price:z.coerce.number().int().nonnegative(),duration:z.coerce.number().int().positive(),sessions:z.coerce.number().int().positive(),description:z.string().default(""),benefits:z.array(z.string()).default([]),status:z.enum(["active","inactive"]).default("active")});
app.post("/api/packages/gym",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.gymPackage.create({data:gymPackageInput.parse(req.body)}))));
app.patch("/api/packages/gym/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{
  const input=gymPackageInput.partial().parse(req.body);const result=await prisma.$transaction(async tx=>{
    const pkg=await tx.gymPackage.update({where:{id:req.params.id},data:input});
    if(input.sessions&&input.sessions>0)await tx.membership.updateMany({where:{packageId:pkg.id,status:"active",sessionsTotal:0},data:{sessionsTotal:input.sessions,sessionsRemaining:input.sessions}});
    return pkg;
  });res.json(result);
}));
app.delete("/api/packages/gym/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{await prisma.gymPackage.delete({where:{id:req.params.id}});res.status(204).end()}));

// Memberships
app.get("/api/memberships",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const where=["admin","owner","gym_fo"].includes(req.user!.role)?{}:req.user!.role==="member"?{userId:req.user!.id}:null;
  if(!where)return res.status(403).json({message:"Insufficient permissions"});
  res.json(await prisma.membership.findMany({where,include:{checkIns:{orderBy:[{date:"desc"},{time:"desc"}],take:10}},orderBy:{expiryDate:"asc"}}));
}));
app.post("/api/memberships",auth,roles("admin","gym_fo"),asyncRoute(async(_req,res)=>res.status(410).json({message:"Memberships can only be activated by verified KPay payment."})));
app.post("/api/memberships/check-in",auth,roles("admin","owner","gym_fo"),asyncRoute(async(req:AuthRequest,res)=>{
  const body=z.object({membershipId:z.string().min(1),note:z.string().optional()}).parse(req.body);
  const date=today(),time=businessNow().clock;
  let result:any;
  try{result=await prisma.$transaction(async tx=>{
    const row=await tx.membership.findUnique({where:{id:body.membershipId}});
    if(!row)return {error:"Gym membership not found.",status:404};
    if(row.status!=="active"||row.expiryDate<date)return {error:"This Gym membership has expired.",status:409};
    if(row.sessionsRemaining<=0)return {error:"No Gym sessions remain on this package.",status:409};
    const duplicate=await tx.gymCheckIn.findUnique({where:{membershipId_date:{membershipId:row.id,date}}});
    if(duplicate)return {error:"This membership is already checked in today.",status:409};
    const changed=await tx.membership.updateMany({where:{id:row.id,status:"active",expiryDate:{gte:date},sessionsRemaining:{gt:0}},data:{sessionsRemaining:{decrement:1},lastCheckIn:`${date} ${time}`}});
    if(!changed.count)return {error:"Membership access changed. Refresh and try again.",status:409};
    const checkIn=await tx.gymCheckIn.create({data:{membershipId:row.id,date,time,staffId:req.user!.id,note:body.note}});
    return {membership:await tx.membership.findUnique({where:{id:row.id}}),checkIn};
  });}catch(error:any){if(error?.code==="P2002")return res.status(409).json({message:"This membership has already been checked in today."});throw error;}
  if("error" in result)return res.status(result.status).json({message:result.error});
  res.status(201).json(result);
}));

// Badminton package ownership + check-in
function addDaysIso(start:string, days:number){ const d=new Date(`${start}T00:00:00`); d.setDate(d.getDate()+Math.max(0,days-1)); return d.toISOString().slice(0,10); }
async function refreshEnrollmentStatus(enrollment:any){
  if(enrollment.status !== "expired" && enrollment.expiryDate < today()) {
    await rawExec(prisma,`UPDATE "BadmintonEnrollment" SET status='expired' WHERE id=?`, enrollment.id);
    enrollment.status='expired';
  }
  return enrollment;
}
app.get("/api/badminton/enrollments",auth,roles("admin","badminton_fo"),asyncRoute(async(_req,res)=>{
  const rows=await rawQuery<any[]>(prisma,`SELECT * FROM "BadmintonEnrollment" ORDER BY status ASC, expiryDate ASC, studentName ASC LIMIT 500`);
  for(const row of rows) await refreshEnrollmentStatus(row);
  res.json(rows);
}));
app.get("/api/badminton/member-accounts",auth,roles("admin","badminton_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.user.findMany({where:{role:"member",active:true},select:{id:true,name:true,email:true,phone:true},orderBy:{name:"asc"}}))));
app.post("/api/badminton/enrollments",auth,roles("admin","badminton_fo"),asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({userId:z.string().min(1).optional(),packageId:z.string().min(1),paymentMethod:z.literal("Cash"),walkIn:z.object({name:z.string().trim().min(2).max(120),phone:z.string().trim().min(5).max(40),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}).optional()}).refine(v=>Boolean(v.userId)||Boolean(v.walkIn),{message:"Select a member account or enter walk-in customer details."}).parse(req.body);
  let member=b.userId?await prisma.user.findFirst({where:{id:b.userId,role:"member",active:true}}):null;
  if(b.userId&&!member)return res.status(400).json({message:"Select an active member account."});
  if(!member&&b.walkIn){const matches=await prisma.user.findMany({where:{role:"member",active:true,phone:b.walkIn.phone},take:2});if(matches.length>1)return res.status(409).json({message:"More than one member account uses this phone. Select the correct account from the member list."});if(matches.length===1)member=matches[0];}
  const pkg=await prisma.badmintonPackage.findFirst({where:{id:b.packageId,status:"active"}});
  if(!pkg)return res.status(400).json({message:"Active badminton package not found."});
  const start=b.walkIn?.startDate||today();if(start<today())return res.status(400).json({message:"Package start date cannot be in the past."});
  const expiry=addDaysIso(start,pkg.validity),staff=req.user!;
  const enrollment=await prisma.$transaction(async tx=>{
    const row=await tx.badmintonEnrollment.create({data:{studentId:member?.id||`WALKIN-${crypto.randomUUID()}`,userId:member?.id||null,studentName:member?.name||b.walkIn!.name,phone:member?.phone||b.walkIn!.phone,packageId:pkg.id,packageName:pkg.title,sessionsTotal:pkg.sessions,sessionsRemaining:pkg.sessions,startDate:start,expiryDate:expiry,status:"active",renewalCount:0,purchaseId:null}});
    if(member)await tx.user.update({where:{id:member.id},data:{membership:pkg.title}});
    await tx.transaction.create({data:{userId:member?.id||null,date:start,customer:member?.name||b.walkIn!.name,business:"Badminton",item:`Package · ${pkg.title}`,amount:pkg.price,discount:0,tax:0,finalAmount:pkg.price,paymentMethod:"Cash",staff:staff.name,status:"paid"}});
    if(member)await tx.notification.create({data:{userId:member.id,title:"Badminton package activated",body:`${pkg.title} is active with ${pkg.sessions} sessions through ${expiry}.`,link:"/membership",audience:"member",type:"package",icon:"package",entityType:"package",entityId:pkg.id}});
    return row;
  });
  res.status(201).json(enrollment);
}));
app.post("/api/member/badminton-packages/:id/purchase",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const pkg=await prisma.badmintonPackage.findUnique({where:{id:String(req.params.id)}});
  if(!pkg)return res.status(404).json({message:"This badminton package could not be found."});
  if(pkg.status==="coming_soon")return res.status(409).json({message:"This badminton package is coming soon and is not available to purchase yet."});
  if(pkg.status!=="active")return res.status(409).json({message:"This badminton package is not currently available to purchase."});
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
    const enrollment=(await rawQuery<any[]>(tx,`INSERT INTO "BadmintonEnrollment" (id,studentId,userId,studentName,phone,packageId,packageName,sessionsTotal,sessionsRemaining,startDate,expiryDate,status,renewalCount,purchaseId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,enrollmentId,purchase.userId,purchase.userId,purchase.user.name,purchase.user.phone||"",purchase.packageId,purchase.packageName,purchase.package.sessions,purchase.package.sessions,start,expiry,"active",0,purchase.id))[0];
    await tx.transaction.create({data:{userId:purchase.userId,date:start,customer:purchase.user.name,business:"Badminton",item:`Package · ${purchase.packageName}`,amount:purchase.price,discount:0,tax:0,finalAmount:purchase.price,paymentMethod:b.paymentMethod,staff:req.user!.name,status:"paid"}});
    await tx.notification.create({data:{userId:purchase.userId,title:"Badminton package activated",body:`Payment received for ${purchase.packageName}. Your sessions are ready to use.`,link:"/membership",audience:"member",type:"payment"}});
    return enrollment;
  });
  if(!result)return res.status(404).json({message:"Package request not found."});
  res.json(result); */
}));
app.post("/api/badminton/enrollments/:id/renew",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({packageId:z.string().min(1),paymentMethod:z.literal("Cash")}).parse(req.body),staff=(req as AuthRequest).user!;
  const current=await prisma.badmintonEnrollment.findUnique({where:{id:String(req.params.id)}});
  if(!current)return res.status(404).json({message:"Package holder not found."});
  if(!current.userId)return res.status(409).json({message:"This legacy package is not linked to a member account and cannot be renewed."});
  const [member,pkg]=await Promise.all([prisma.user.findFirst({where:{id:current.userId,role:"member",active:true}}),prisma.badmintonPackage.findFirst({where:{id:b.packageId,status:"active"}})]);
  if(!member)return res.status(409).json({message:"This member account is no longer active."});
  if(!pkg)return res.status(400).json({message:"Active badminton package not found."});
  const start=today(),expiry=addDaysIso(start,pkg.validity);
  const enrollment=await prisma.$transaction(async tx=>{
    const locked=await tx.badmintonEnrollment.updateMany({where:{id:current.id,status:current.status},data:{status:"renewed"}});
    if(!locked.count)throw Object.assign(new Error("This package was updated by another staff member. Refresh and try again."),{statusCode:409});
    const purchase=await tx.badmintonPackagePurchase.create({data:{code:code("BP"),userId:member.id,packageId:pkg.id,packageName:pkg.title,price:pkg.price,paymentMethod:"Cash",status:"PAID",paidAt:new Date()}});
    const row=await tx.badmintonEnrollment.create({data:{studentId:member.id,userId:member.id,studentName:member.name,phone:member.phone||"",packageId:pkg.id,packageName:pkg.title,sessionsTotal:pkg.sessions,sessionsRemaining:pkg.sessions,startDate:start,expiryDate:expiry,status:"active",renewalCount:current.renewalCount+1,purchaseId:purchase.id}});
    await tx.user.update({where:{id:member.id},data:{membership:pkg.title}});
    await tx.transaction.create({data:{userId:member.id,date:start,customer:member.name,business:"Badminton",item:`Package renewal · ${pkg.title}`,amount:pkg.price,discount:0,tax:0,finalAmount:pkg.price,paymentMethod:"Cash",staff:staff.name,status:"paid"}});
    await tx.notification.create({data:{userId:member.id,title:"Badminton package renewed",body:`${pkg.title} is active with ${pkg.sessions} sessions through ${expiry}.`,link:"/membership",audience:"member",type:"package",icon:"package",entityType:"package",entityId:pkg.id}});
    return row;
  });
  res.json(enrollment);
}));
app.get("/api/badminton/enrollments/:id/check-ins",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>res.json(await rawQuery<any[]>(prisma,`SELECT * FROM "BadmintonCheckIn" WHERE enrollmentId=? ORDER BY date DESC,time DESC`,req.params.id))));
app.post("/api/badminton/check-ins",auth,roles("admin","badminton_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({enrollmentId:z.string().min(1),note:z.string().optional()}).parse(req.body);
  const current=(await rawQuery<any[]>(prisma,`SELECT * FROM "BadmintonEnrollment" WHERE id=?`,b.enrollmentId))[0];
  if(!current) return res.status(404).json({message:"Student package not found"});
  if(current.status !== "expired" && current.expiryDate < today()) { await rawExec(prisma,`UPDATE "BadmintonEnrollment" SET status='expired' WHERE id=?`,b.enrollmentId); current.status='expired'; }
  if(current.status !== "active") return res.status(409).json({code:"PACKAGE_EXPIRED",message:"This student's package has expired. Renew the package before check-in."});
  if(Number(current.sessionsRemaining)<=0) return res.status(409).json({code:"NO_SESSIONS",message:"This student has no sessions remaining. Renew the package before check-in."});
  const time=businessNow().clock; const id=code("CHK");
  const result=await prisma.$transaction(async(tx)=>{
    const date=today();
    const updated=(await rawQuery<any[]>(tx,`UPDATE "BadmintonEnrollment" SET sessionsRemaining=sessionsRemaining-1,lastCheckIn=? WHERE id=? AND status='active' AND expiryDate>=? AND sessionsRemaining>0 AND NOT EXISTS (SELECT 1 FROM "BadmintonCheckIn" WHERE enrollmentId=? AND date=?) RETURNING *`,`${date} ${time}`,b.enrollmentId,date,b.enrollmentId,date))[0];
    if(!updated){const already=await rawQuery<any[]>(tx,`SELECT id FROM "BadmintonCheckIn" WHERE enrollmentId=? AND date=? LIMIT 1`,b.enrollmentId,date);throw Object.assign(new Error(already.length?"This package has already been checked in today.":"Package is no longer available."),{statusCode:409});}
    const check=(await rawQuery<any[]>(tx,`INSERT INTO "BadmintonCheckIn" (id,enrollmentId,date,time,sessionsUsed,staffId,note) VALUES (?,?,?,?,?,?,?) RETURNING *`,id,b.enrollmentId,date,time,1,(req as AuthRequest).user?.id||null,b.note||null))[0];
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
    await rawExec(tx,`UPDATE "Doctor" SET status=status WHERE id=?`,doctorId);
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
  status: z.enum(["active", "inactive"]).default("active"),
  imageUrl: z.string().max(2048).refine(isStoredImageUrl, "Choose an uploaded image URL.").nullable().optional(),
});

async function productRows(where = "", ...params: any[]) {
  return rawQuery<any[]>(prisma,`SELECT p.id,p.name,p.price,p.category,p.description,p.sku,p.barcode,p.stock,p.cost,p.tax,p.status,p.imageUrl,
    ${"categoryId"} AS categoryId
    FROM "Product" p ${where} ORDER BY p.name ASC`, ...params);
}

app.get("/api/products", asyncRoute(async (_req, res) => {
  res.json(await productRows());
}));

app.post("/api/products", auth, roles("admin", "store_fo"), asyncRoute(async (req, res) => {
  const b = productInput.parse(req.body);
  const id = crypto.randomUUID();
  await rawExec(prisma,
    `INSERT INTO "Product" (id,name,price,category,description,sku,barcode,stock,cost,tax,status,categoryId,imageUrl)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,b.name,b.price,b.category,b.description,b.sku,b.barcode,b.stock,b.cost,b.tax,b.status,b.categoryId ?? null,b.imageUrl ?? null
  );
  const rows = await productRows(`WHERE p.id = ?`, id);
  res.status(201).json(rows[0]);
}));

app.patch("/api/products/:id", auth, roles("admin", "store_fo"), asyncRoute(async (req, res) => {
  const b = productInput.partial().parse(req.body);
  const id = String(req.params.id);
  const fields: string[] = [];
  const values: any[] = [];
  const map: Record<string,string> = {name:"name",price:"price",category:"category",categoryId:"categoryId",description:"description",sku:"sku",barcode:"barcode",stock:"stock",cost:"cost",tax:"tax",status:"status",imageUrl:"imageUrl"};
  for (const [key,col] of Object.entries(map)) if (key in b) { fields.push(`"${col}" = ?`); values.push((b as any)[key] ?? null); }
  if (!fields.length) return res.status(400).json({message:"No fields to update"});
  values.push(id);
  await rawExec(prisma,`UPDATE "Product" SET ${fields.join(", ")} WHERE id = ?`, ...values);
  const rows = await productRows(`WHERE p.id = ?`, id);
  if (!rows[0]) return res.status(404).json({message:"Product not found"});
  res.json(rows[0]);
}));

app.post("/api/products/:id/stock", auth, roles("admin", "store_fo"), asyncRoute(async (req, res) => {
  const b = z.object({quantity:z.number().int(),note:z.string().default("")}).parse(req.body);
  const id = String(req.params.id);
  await prisma.$transaction(async tx => {
    const rows = await rawQuery<any[]>(tx,`SELECT id FROM "Product" WHERE id = ?`, id);
    if (!rows[0]) throw Object.assign(new Error("Product not found"), { statusCode: 404 });
    await rawExec(tx,`UPDATE "Product" SET stock = stock + ? WHERE id = ?`, b.quantity, id);
    await rawExec(tx,`INSERT INTO "InventoryTransaction" (id,productId,type,quantity,note,date) VALUES (?,?,?,?,?,?)`,
      crypto.randomUUID(), id, b.quantity >= 0 ? "add" : "remove", Math.abs(b.quantity), b.note, today());
  });
  const rows = await productRows(`WHERE p.id = ?`, id);
  res.json(rows[0]);
}));

app.get("/api/inventory", auth, roles("admin", "owner", "store_fo"), asyncRoute(async (_req, res) => {
  const rows = await rawQuery<any[]>(prisma,`SELECT i.id,i.productId,i.type,i.quantity,i.note,i.date,
    p.id as product_id,p.name as product_name,p.price as product_price,p.category as product_category,
    p.description as product_description,p.sku as product_sku,p.barcode as product_barcode,p.stock as product_stock,
    p.cost as product_cost,p.tax as product_tax,p.status as product_status,p.imageUrl as product_imageUrl,
    p.categoryId as product_categoryId
    FROM "InventoryTransaction" i JOIN "Product" p ON p.id=i.productId ORDER BY i.date DESC`);
  res.json(rows.map(r => ({
    id:r.id, productId:r.productId, type:r.type, quantity:r.quantity, note:r.note, date:r.date,
    product:{id:r.product_id,name:r.product_name,price:r.product_price,category:r.product_category,description:r.product_description,
      sku:r.product_sku,barcode:r.product_barcode,stock:r.product_stock,cost:r.product_cost,tax:r.product_tax,status:r.product_status,categoryId:r.product_categoryId,imageUrl:r.product_imageUrl}
  })));
}));

app.delete("/api/products/:id", auth, roles("admin", "store_fo"), asyncRoute(async (req,res) => {
  const result = await rawExec(prisma,`DELETE FROM "Product" WHERE id = ?`, String(req.params.id));
  if (!result) return res.status(404).json({message:"Product not found"});
  res.status(204).end();
}));

// Legacy student snapshots remain readable to admins for migration review, but
// new identity and package ownership must use User accounts.
app.get("/api/students",auth,roles("admin"),asyncRoute(async(_req,res)=>res.json(await prisma.student.findMany({orderBy:{name:"asc"}}))));
app.post("/api/students",auth,roles("admin"),asyncRoute(async(_req,res)=>res.status(410).json({message:"Student registration is retired. Create a member account in Users instead."})));
app.patch("/api/students/:id",auth,roles("admin"),asyncRoute(async(_req,res)=>res.status(410).json({message:"Student identity records are retired. Manage the central account in Users."})));
app.delete("/api/students/:id",auth,roles("admin"),asyncRoute(async(_req,res)=>res.status(410).json({message:"Legacy student snapshots are retained for historical records."})));

// Transactions
app.get("/api/transactions",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const hasPage=typeof req.query.page!=="undefined",page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));
  const where:any=req.user!.role==="member"?{userId:req.user!.id}:{};
  if(!["admin","owner","gym_fo","badminton_fo","clinic_fo","store_fo","cafe_fo","member"].includes(req.user!.role))return res.status(403).json({message:"Insufficient permissions"});
  if(req.query.business){if(!Object.values(TransactionBusiness).includes(String(req.query.business) as TransactionBusiness))return res.status(400).json({message:"Choose a valid business filter."});where.business=String(req.query.business);}
  if(req.query.from||req.query.to)where.date={...(req.query.from?{gte:String(req.query.from)}:{}),...(req.query.to?{lte:String(req.query.to)}:{})};
  if(req.query.date)where.date=String(req.query.date);
  if(req.query.status)where.status=String(req.query.status);
  if(req.query.paymentMethod)where.paymentMethod=String(req.query.paymentMethod);
  if(req.query.item)where.item={contains:String(req.query.item).trim()};
  const q=String(req.query.q||"").trim();if(q)where.OR=[{customer:{contains:q}},{item:{contains:q}},{id:{contains:q}},{staff:{contains:q}}];
  if(!hasPage)return res.json(await prisma.transaction.findMany({where,orderBy:{createdAt:"desc"},take:100}));
  const [total,data,summary]=await Promise.all([prisma.transaction.count({where}),prisma.transaction.findMany({where,orderBy:{createdAt:"desc"},skip:(page-1)*limit,take:limit}),prisma.transaction.aggregate({where,_sum:{amount:true,discount:true,finalAmount:true}})]);
  const totalPages=Math.ceil(total/limit);
  res.json({data,pagination:{page,limit,total,totalPages,hasNextPage:page<totalPages,hasPreviousPage:page>1&&total>0},summary:{gross:summary._sum.amount||0,discounts:summary._sum.discount||0,net:summary._sum.finalAmount||0}});
}));
app.post("/api/transactions",auth,roles("admin","cafe_fo"),asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),customer:z.string().min(1).max(120),business:z.literal("Cafe"),items:z.array(z.object({id:z.string().min(1),quantity:z.number().int().min(1).max(20)})).min(1).max(50),paymentMethod:z.literal("Cash")}).parse(req.body);
  const menu=await prisma.cafeMenuItem.findMany({where:{id:{in:b.items.map(i=>i.id)},available:true}});
  if(menu.length!==new Set(b.items.map(i=>i.id)).size)return res.status(409).json({message:"One or more cafe menu items are no longer available."});
  const lines=b.items.map(line=>{const item=menu.find(m=>m.id===line.id)!;return {id:item.id,name:item.name,price:item.price,quantity:line.quantity};});
  const total=lines.reduce((sum,line)=>sum+line.price*line.quantity,0);
  if(total<=0)return res.status(400).json({message:"Transaction total must be greater than zero."});
  const summary=lines.map(line=>`${line.name} ×${line.quantity}`).join(", ");
  const transaction=await prisma.$transaction(async tx=>{
    const record=await tx.transaction.create({data:{date:b.date,customer:b.customer,business:"Cafe",item:summary,amount:total,discount:0,tax:0,finalAmount:total,paymentMethod:"Cash",staff:req.user!.name,status:"paid"}});
    await tx.notification.create({data:{userId:null,audience:"cafe_fo",title:"New cash cafe transaction",body:`${b.customer} · ${summary} · ${total.toLocaleString()} MMK`,link:"/cafe/transactions",type:"transaction",icon:"shopping-bag",entityType:"transaction",entityId:record.id}});
    await tx.notification.create({data:{userId:null,audience:"admin",title:"New cafe transaction",body:`${b.customer} · ${total.toLocaleString()} MMK`,link:"/admin/finance",type:"transaction",icon:"credit-card",entityType:"transaction",entityId:record.id}});
    return record;
  });
  res.status(201).json(transaction);
}));

// Content
app.get("/api/content",asyncRoute(async(_req,res)=>res.json(await prisma.contentItem.findMany({where:{status:"published",publishDate:{lte:today()}},orderBy:{publishDate:"desc"},take:100}))));
app.get("/api/admin/content",auth,roles("admin","owner"),asyncRoute(async(_req,res)=>res.json(await prisma.contentItem.findMany({orderBy:{publishDate:"desc"},take:100}))));
app.post("/api/content",auth,roles("admin"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.contentItem.create({data:req.body}))));
app.patch("/api/content/:id",auth,roles("admin"),asyncRoute(async(req,res)=>res.json(await prisma.contentItem.update({where:{id:req.params.id},data:req.body}))));
app.delete("/api/content/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{await prisma.contentItem.delete({where:{id:req.params.id}});res.status(204).end()}));
app.patch("/api/content/:id/publish",auth,roles("admin"),asyncRoute(async(req,res)=>res.json(await prisma.contentItem.update({where:{id:req.params.id},data:{status:"published",publishDate:today()}}))));

// Member badminton dashboard and private course workflow. Private-course requests
// share Booking rows with court rentals so the same court calendar stays authoritative.
const occupyingStatuses = ["pending", "confirmed", "CONFIRMED", "PENDING_COACH_CONFIRMATION", "AWAITING_PAYMENT"] as any;
app.get("/api/member/dashboard",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const dashboardDate=String(req.query.referenceDate||today());
  if(!isDateKey(dashboardDate))return res.status(400).json({message:"Choose a valid dashboard date."});
  const [todayBookings,upcomingBookings,recentBookings,todayBookingCount,upcomingBookingCount,packages,notifications,enrollments,purchases]=await Promise.all([
    prisma.booking.findMany({where:{userId:req.user!.id,date:dashboardDate,status:{notIn:["cancelled","CANCELLED","completed","COMPLETED","COACH_DECLINED","EXPIRED"]}},include:{court:true,coach:true},orderBy:{time:"asc"},take:20}),
    prisma.booking.findMany({where:{userId:req.user!.id,date:{gt:dashboardDate},status:{notIn:["cancelled","CANCELLED","completed","COMPLETED","COACH_DECLINED","EXPIRED"]}},include:{court:true,coach:true},orderBy:[{date:"asc"},{time:"asc"}],take:20}),
    prisma.booking.findMany({where:{userId:req.user!.id},include:{court:true,coach:true},orderBy:{createdAt:"desc"},take:8}),
    prisma.booking.count({where:{userId:req.user!.id,date:dashboardDate,status:{notIn:["cancelled","CANCELLED","completed","COMPLETED","COACH_DECLINED","EXPIRED"]}}}),
    prisma.booking.count({where:{userId:req.user!.id,date:{gt:dashboardDate},status:{notIn:["cancelled","CANCELLED","completed","COMPLETED","COACH_DECLINED","EXPIRED"]}}}),
    prisma.badmintonPackage.findMany({where:{status:{in:["active","coming_soon"]}},include:{category:true},orderBy:{title:"asc"}}),
    prisma.notification.findMany({where:{userId:req.user!.id,read:false},orderBy:{createdAt:"desc"},take:6}),
    rawQuery<any[]>(prisma,`SELECT * FROM "BadmintonEnrollment" WHERE userId=? OR studentId=? ORDER BY createdAt DESC`,req.user!.id,req.user!.id),
    prisma.badmintonPackagePurchase.findMany({where:{userId:req.user!.id},orderBy:{createdAt:"desc"}})
  ]);
  const active=enrollments.find(e=>e.status==="active"&&e.expiryDate>=today()&&Number(e.sessionsRemaining)>0)||null;
  const checkIns=active?await rawQuery<any[]>(prisma,`SELECT * FROM "BadmintonCheckIn" WHERE enrollmentId=? ORDER BY date DESC,time DESC LIMIT 12`,active.id):[];
  const bookings=[...new Map([...todayBookings,...upcomingBookings,...recentBookings].map(booking=>[booking.id,booking])).values()];
  res.json({bookings,recentBookings,todayBookings,todayBookingCount,upcomingBookings,upcomingBookingCount,packages,notifications,enrollment:active,enrollmentHistory:enrollments,checkIns,purchases});
}));
app.post("/api/member/check-in",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const current=(await rawQuery<any[]>(prisma,`SELECT * FROM "BadmintonEnrollment" WHERE id=? AND (userId=? OR studentId=?)`,String(req.body.enrollmentId||""),req.user!.id,req.user!.id))[0];
  if(!current)return res.status(404).json({message:"No badminton package was found for your account."});
  if(current.expiryDate<today()||current.status!=="active")return res.status(409).json({message:"This badminton package has expired."});
  if(Number(current.sessionsRemaining)<=0)return res.status(409).json({message:"No sessions remain on this package."});
  const date=today(),time=businessNow().clock,id=code("CHK");
  try {
    const result=await prisma.$transaction(async tx=>{
      const updated=(await rawQuery<any[]>(tx,"UPDATE \"BadmintonEnrollment\" SET sessionsRemaining=sessionsRemaining-1,lastCheckIn=? WHERE id=? AND (userId=? OR studentId=?) AND status='active' AND expiryDate>=? AND sessionsRemaining>0 AND NOT EXISTS (SELECT 1 FROM \"BadmintonCheckIn\" WHERE enrollmentId=? AND date=?) RETURNING *",`${date} ${time}`,current.id,req.user!.id,req.user!.id,date,current.id,date))[0];
      if(!updated){
        const already=await rawQuery<any[]>(tx,`SELECT id FROM "BadmintonCheckIn" WHERE enrollmentId=? AND date=? LIMIT 1`,current.id,date);
        throw Object.assign(new Error(already.length?"You have already checked in today.":"This package can no longer be used."),{statusCode:409});
      }
      const checkIn=(await rawQuery<any[]>(tx,`INSERT INTO "BadmintonCheckIn" (id,enrollmentId,date,time,sessionsUsed,note) VALUES (?,?,?,?,1,'Member self check-in') RETURNING *`,id,current.id,date,time))[0];
      return {enrollment:updated,checkIn};
    });
    res.status(201).json(result);
  } catch(error:any) { if(error.statusCode===409)return res.status(409).json({message:error.message}); throw error; }
}));
app.get("/api/private-courses",auth,roles("admin","owner","member"),asyncRoute(async(req:AuthRequest,res)=>res.json(await prisma.privateCourse.findMany({where:["admin","owner"].includes(req.user!.role)?{}:{status:"active"},include:{coaches:{where:{department:"Badminton",status:"active",user:{is:{active:true,role:"coach"}}},include:{user:{select:{id:true,name:true,avatar:true,active:true}}}}},orderBy:{title:"asc"},take:100}))));
app.post("/api/private-courses",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({title:z.string().min(3),description:z.string().default(""),duration:z.number().int().min(30).max(180).default(60),price:z.number().int().nonnegative(),status:z.enum(["active","inactive"]).default("active"),category:z.string().default("Private Training"),coachIds:z.array(z.string()).min(1).default([])}).parse(req.body);
  if(!b.coachIds.length)return res.status(400).json({message:"Assign at least one active coach to this private course."});
  const coaches=await prisma.coach.findMany({where:{id:{in:b.coachIds},department:"Badminton",status:"active",user:{is:{active:true,role:"coach"}}}});if(coaches.length!==b.coachIds.length)return res.status(400).json({message:"Courses can only be assigned to active linked badminton coach profiles."});
  const {coachIds,...data}=b;res.status(201).json(await prisma.privateCourse.create({data:{...data,coaches:{connect:coachIds.map(id=>({id}))},...(req.body.imageUrl?{imageUrl:String(req.body.imageUrl)}:{})},include:{coaches:{include:{user:{select:{id:true,name:true,avatar:true,active:true}}}}}}));
}));
app.post("/api/private-courses/:id/image",auth,roles("admin"),asyncRoute(async(req,res)=>{const b=z.object({image:z.string().min(1)}).parse(req.body);const imageUrl=await saveProfileImage(b.image,"courses");res.json(await prisma.privateCourse.update({where:{id:String(req.params.id)},data:{imageUrl}}));}));
app.patch("/api/private-courses/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{
  const b=z.object({title:z.string().min(3).optional(),description:z.string().optional(),duration:z.number().int().min(30).max(180).optional(),price:z.number().int().nonnegative().optional(),status:z.enum(["active","inactive"]).optional(),category:z.string().optional(),coachIds:z.array(z.string()).min(1).optional(),imageUrl:z.string().nullable().optional()}).parse(req.body);
  const {coachIds,...data}=b;if(coachIds){if(!coachIds.length)return res.status(400).json({message:"Assign at least one active coach to this private course."});const coaches=await prisma.coach.findMany({where:{id:{in:coachIds},department:"Badminton",status:"active",user:{is:{active:true,role:"coach"}}}});if(coaches.length!==coachIds.length)return res.status(400).json({message:"Courses can only be assigned to active linked badminton coach profiles."});}
  res.json(await prisma.privateCourse.update({where:{id:String(req.params.id)},data:{...data,...(coachIds?{coaches:{set:coachIds.map(id=>({id}))}}:{})},include:{coaches:{include:{user:{select:{id:true,name:true,avatar:true,active:true}}}}}}));
}));
app.delete("/api/private-courses/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{const id=String(req.params.id);const count=await prisma.booking.count({where:{kind:"private_course",meta:{contains:id}}});if(count)await prisma.privateCourse.update({where:{id},data:{status:"inactive"}});else await prisma.privateCourse.delete({where:{id}});res.status(count?200:204).json(count?{status:"inactive",preservedHistory:true}:undefined)}));
app.get("/api/member/private-courses",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{await expirePrivateCourseReservations();res.json(await prisma.booking.findMany({where:{userId:req.user!.id,kind:"private_course"},include:{court:true,coach:true},orderBy:{createdAt:"desc"},take:100}))}));
app.post("/api/member/private-courses",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({courseId:z.string(),courtId:z.string(),coachId:z.string(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string()}).parse(req.body);
  if(!isDateKey(b.date)||b.date<today())return res.status(400).json({message:"Choose a valid future date."});
  const timeRange=(value:string)=>{const p=value.split(/\s*(?:—|–|-)\s*/);const min=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]};const start=min(p[0]||""),end=min(p[1]||"");return p.length===2&&end>start?{start,end}:null};
  const wanted=timeRange(b.time);if(!wanted)return res.status(400).json({message:"Choose a valid course time slot."});
  if(wanted.start<360||wanted.end>1260||wanted.start%60!==0)return res.status(400).json({message:"Choose a start time between 6:00 AM and 8:00 PM."});
  if(b.date===today()&&wanted.start<=businessNow().hour*60+businessNow().minute)return res.status(400).json({message:"Choose a time that has not passed yet."});
  const overlap=(x:string)=>{const r=timeRange(x);return !!r&&wanted.start<r.end&&r.start<wanted.end};
  const booking=await prisma.$transaction(async tx=>{
    await rawExec(tx,`UPDATE "Court" SET status=status WHERE id=?`,b.courtId);
    await rawExec(tx,`UPDATE "Coach" SET status=status WHERE id=?`,b.coachId);
    const [course,court,coach,member,override]=await Promise.all([
      tx.privateCourse.findFirst({where:{id:b.courseId,status:"active",coaches:{some:{id:b.coachId}}}}),
      tx.court.findUnique({where:{id:b.courtId}}),
      tx.coach.findFirst({where:{id:b.coachId,department:"Badminton",status:"active",user:{is:{role:"coach",active:true}}},include:{user:true}}),
      tx.user.findUnique({where:{id:req.user!.id},select:{name:true,email:true,phone:true}}),
      tx.courtDateOverride.findUnique({where:{date:b.date}})
    ]);
    if(!course)throw Object.assign(new Error("That course is no longer available or the coach is not assigned to it."),{statusCode:409});
    if(!court||court.status!=="available")throw Object.assign(new Error("That court is no longer available."),{statusCode:409});
    if(!coach||!coach.user)throw Object.assign(new Error("That coach account is no longer available."),{statusCode:409});
    if(wanted.end-wanted.start!==course.duration)throw Object.assign(new Error(`Choose a ${course.duration}-minute time slot.`),{statusCode:400});
    if(override?.type==="closed")throw Object.assign(new Error(`Courts are closed on ${b.date}.`),{statusCode:409});
    const whereBlocks:any={courtId:b.courtId,active:true,OR:override?.type==="open"?[{date:b.date}]:[{date:b.date},{dayOfWeek:new Date(`${b.date}T00:00:00`).getDay()}]};
    const [conflicts,blocks]=await Promise.all([
      tx.booking.findMany({where:{date:b.date,status:{in:occupyingStatuses},OR:[{courtId:b.courtId},{coachId:b.coachId}]},select:{time:true,courtId:true,coachId:true}}),
      tx.courtBlock.findMany({where:whereBlocks})
    ]);
    if(conflicts.some(x=>(x.courtId===b.courtId||x.coachId===b.coachId)&&overlap(x.time)))throw Object.assign(new Error("The selected court or coach has just become unavailable."),{statusCode:409});
    if(blocks.some(x=>overlap(`${x.start} — ${x.end}`)))throw Object.assign(new Error("The selected court is reserved during this time."),{statusCode:409});
    const meta=JSON.stringify({courseId:course.id,courseTitle:course.title,memberEmail:member?.email,memberPhone:member?.phone});
    const created=await tx.booking.create({data:{code:code("PC"),userId:req.user!.id,kind:"private_course",title:course.title,date:b.date,time:b.time,location:court.name,courtId:court.id,coachId:coach.id,price:course.price,meta,status:"PENDING_COACH_CONFIRMATION",paymentStatus:"pending",reservationExpiresAt:null,coachAcceptedAt:null,paymentExpiresAt:null}});
    await tx.notification.create({data:{userId:req.user!.id,title:"Private course request sent",body:`Your request for ${course.title} with ${coach.name} · ${b.date} · ${b.time} · ${court.name} is waiting for coach confirmation.`,link:"/bookings",audience:"member",type:"booking",icon:"clock",entityType:"booking",entityId:created.id}});
    await tx.notification.create({data:{userId:coach.user.id,title:"New private course request",body:`${member?.name||"A member"} (${member?.email||"No email"} · ${member?.phone||"No phone"}) requested ${course.title} · ${b.date} · ${b.time} · ${court.name}. Request ${created.code}.`,link:"/coach/bookings",audience:"coach",type:"booking",icon:"calendar",imageUrl:coach.imageUrl||undefined,actionLabel:"Review request",entityType:"booking",entityId:created.id}});
    return {booking:created,coachName:coach.name,courtName:court.name};
  });
  res.status(201).json({booking:booking.booking});
}));
app.post("/api/coach/private-courses/:id/decision",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  const body=z.object({decision:z.enum(["accept","decline"])}).parse(req.body);
  const coach=await prisma.coach.findUnique({where:{userId:req.user!.id},include:{user:true}});
  if(!coach||coach.status!=="active"||coach.department!=="Badminton")return res.status(403).json({message:"An active badminton coach profile is required."});
  const id=String(req.params.id),now=new Date();
  const result=await prisma.$transaction(async tx=>{
    await rawExec(tx,`UPDATE "Coach" SET status=status WHERE id=?`,coach.id);
    const booking=await tx.booking.findUnique({where:{id},include:{user:{select:{id:true,name:true}},court:true,coach:true}});
    if(!booking||booking.kind!=="private_course")throw Object.assign(new Error("Private course request not found."),{statusCode:404});
    if(booking.coachId!==coach.id)throw Object.assign(new Error("This request belongs to another coach."),{statusCode:403});
    if(booking.status!=="PENDING_COACH_CONFIRMATION")throw Object.assign(new Error("This request has already been handled."),{statusCode:409});
    if(body.decision==="decline"){
      const changed=await tx.booking.updateMany({where:{id,status:"PENDING_COACH_CONFIRMATION"},data:{status:"COACH_DECLINED",reservationExpiresAt:null,paymentExpiresAt:null}});
      if(!changed.count)throw Object.assign(new Error("This request has already been handled."),{statusCode:409});
      await tx.notification.updateMany({where:{userId:req.user!.id,entityId:booking.id,activeInInbox:true},data:{read:true,activeInInbox:false}});
      await tx.notification.create({data:{userId:booking.userId,title:"Coach declined your private course",body:`Unfortunately, ${coach.name} is unavailable for ${booking.title} · ${booking.date} · ${booking.time}. The reservation has been released; you will not be charged.`,link:"/private-course",audience:"member",type:"booking",icon:"x-circle",entityType:"booking",entityId:booking.id}});
      return tx.booking.findUniqueOrThrow({where:{id},include:{court:true,coach:true}});
    }
    if(!booking.courtId||!booking.court||booking.court.status!=="available")throw Object.assign(new Error("The reserved court is no longer available. Decline this request so the member can choose another time."),{statusCode:409});
    const tRange=(v:string)=>{const p=v.split(/\s*(?:—|–|-)\s*/);const min=(v:string)=>{const m=v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);if(!m)return NaN;let h=+m[1];if(h===12)h=0;if(m[3].toUpperCase()==="PM")h+=12;return h*60+ +m[2]};return p.length===2?[min(p[0]),min(p[1])]:[NaN,NaN]};
    const wanted=tRange(booking.time),overlap=(other:string)=>{const r=tRange(other);return Number.isFinite(r[0])&&wanted[0]<r[1]&&r[0]<wanted[1]};
    if(booking.date<today()||(booking.date===today()&&wanted[0]<=businessNow().hour*60+businessNow().minute))throw Object.assign(new Error("This request time has already passed."),{statusCode:409});
    const [override,conflicts]=await Promise.all([
      tx.courtDateOverride.findUnique({where:{date:booking.date}}),
      tx.booking.findMany({where:{id:{not:booking.id},date:booking.date,status:{in:occupyingStatuses},OR:[{courtId:booking.courtId},{coachId:coach.id}]},select:{courtId:true,coachId:true,time:true}})
    ]);
    if(override?.type==="closed")throw Object.assign(new Error("Courts are closed on the requested date."),{statusCode:409});
    if(conflicts.some(x=>(x.courtId===booking.courtId||x.coachId===coach.id)&&overlap(x.time)))throw Object.assign(new Error("The court or coach now has a conflicting booking."),{statusCode:409});
    const dow=new Date(`${booking.date}T00:00:00`).getDay(),blocks=await tx.courtBlock.findMany({where:{courtId:booking.courtId,active:true,OR:override?.type==="open"?[{date:booking.date}]:[{date:booking.date},{dayOfWeek:dow}]}});
    if(blocks.some(x=>overlap(`${x.start} — ${x.end}`)))throw Object.assign(new Error("The court is blocked during this time."),{statusCode:409});
    const paymentExpiresAt=new Date(now.getTime()+24*60*60*1000);
    const changed=await tx.booking.updateMany({where:{id,status:"PENDING_COACH_CONFIRMATION"},data:{status:"AWAITING_PAYMENT",coachAcceptedAt:now,paymentExpiresAt,reservationExpiresAt:paymentExpiresAt}});
    if(!changed.count)throw Object.assign(new Error("This request has already been handled."),{statusCode:409});
    await tx.notification.updateMany({where:{userId:req.user!.id,entityId:booking.id,activeInInbox:true},data:{read:true,activeInInbox:false}});
    await tx.notification.create({data:{userId:booking.userId,title:"Coach confirmed your private course",body:`${coach.name} accepted ${booking.title} for ${booking.date} · ${booking.time}. Complete payment by ${paymentExpiresAt.toLocaleString("en-US",{timeZone:businessTimeZone})}.`,link:"/bookings",audience:"member",type:"booking",icon:"check-circle",actionLabel:"Pay now",entityType:"booking",entityId:booking.id}});
    return tx.booking.findUniqueOrThrow({where:{id},include:{court:true,coach:true}});
  });
  res.json(result);
}));
app.get("/api/coach/private-courses",auth,roles("coach"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const coach=await prisma.coach.findUnique({where:{userId:req.user!.id}});
  if(!coach)return res.json([]);
  res.json(await prisma.booking.findMany({where:{coachId:coach.id,kind:"private_course",status:{in:["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT","CONFIRMED","COMPLETED"]}},include:{user:{select:{id:true,name:true,email:true,phone:true}},court:true},orderBy:[{date:"asc"},{time:"asc"}],take:200}));
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
  const coach=await prisma.coach.findUnique({where:{userId:req.user!.id}});
  if(!coach)return res.json({coach:null,bookings:[]});
  const start=String(req.query.start||today()),end=String(req.query.end||start);
  if(!isDateKey(start)||!isDateKey(end)||end<start)return res.status(400).json({message:"Choose a valid calendar date range."});
  await expirePrivateCourseReservations();
  const bookings=await prisma.booking.findMany({
    where:{coachId:coach.id,kind:"private_course",date:{gte:start,lte:end},status:{in:["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT","CONFIRMED","COMPLETED"]}},
    include:{user:{select:{id:true,name:true,email:true,phone:true}},court:true,coach:true},
    orderBy:[{date:"asc"},{time:"asc"}],take:300
  });
  res.json({coach:{id:coach.id,name:coach.name,imageUrl:coach.imageUrl},bookings});
}));
app.post("/api/member/private-courses/:id/cancel",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const booking=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{coach:true}});
  if(!booking||booking.userId!==req.user!.id||booking.kind!=="private_course")return res.status(404).json({message:"Private course booking not found."});
  if(!["PENDING_COACH_CONFIRMATION","AWAITING_PAYMENT","CONFIRMED"].includes(booking.status)||booking.date<today())return res.status(409).json({message:"This booking can no longer be cancelled online."});
  const updated=await prisma.$transaction(async tx=>{
    if(booking.status==="AWAITING_PAYMENT"){
      const activeAttempt=await tx.paymentAttempt.findFirst({where:{resourceType:"private_course",resourceId:booking.id,status:{in:["PENDING","INITIATING"]},expiresAt:{gt:new Date()}}});
      if(activeAttempt)throw Object.assign(new Error("A KPay checkout is already active. Complete the payment or wait for its checkout deadline before cancelling."),{statusCode:409});
    }
    const changed=await tx.booking.updateMany({where:{id:booking.id,userId:req.user!.id,status:booking.status},data:{status:"CANCELLED",reservationExpiresAt:null,paymentExpiresAt:null}});
    if(!changed.count)throw Object.assign(new Error("This booking has already changed. Refresh your bookings and try again."),{statusCode:409});
    await tx.notification.create({data:{userId:req.user!.id,title:"Private course cancelled",body:`${booking.title} on ${booking.date} at ${booking.time} was cancelled.`,link:"/bookings",audience:"member",type:"booking",entityType:"booking",entityId:booking.id}});
    if(booking.coach?.userId)await tx.notification.create({data:{userId:booking.coach.userId,title:"Private course cancelled",body:`A member cancelled ${booking.title} · ${booking.date} · ${booking.time}.`,link:"/coach/schedule",audience:"coach",type:"booking",entityType:"booking",entityId:booking.id}});
    return tx.booking.findUniqueOrThrow({where:{id:booking.id},include:{court:true,coach:true}});
  });
  res.json(updated);
}));
app.post("/api/member/private-courses/:id/pay",auth,roles("member"),asyncRoute(async(req:AuthRequest,res)=>{
  await expirePrivateCourseReservations();
  const current=await prisma.booking.findUnique({where:{id:String(req.params.id)},include:{coach:true,court:true,user:true}});
  if(!current||current.userId!==req.user!.id||current.kind!=="private_course")return res.status(404).json({message:"Private course booking not found."});
  if(current.status!=="AWAITING_PAYMENT")return res.status(409).json({message:current.status==="EXPIRED"?"The reservation window expired and this slot has been released.":"This private course is not awaiting confirmation."});
  const expiresAt=current.paymentExpiresAt||current.reservationExpiresAt||(current.coachAcceptedAt?new Date(current.coachAcceptedAt.getTime()+24*60*60*1000):null);
  if(!expiresAt||expiresAt<=new Date())return res.status(409).json({message:"This reservation window has expired. Refresh your bookings and choose another time."});
  const booking=await prisma.$transaction(async tx=>{
    const now=new Date();
    const fallbackDeadline=current.coachAcceptedAt?new Date(current.coachAcceptedAt.getTime()+24*60*60*1000):null;
    const activeDeadline:[Record<string,unknown>,...Record<string,unknown>[]]=[{paymentExpiresAt:{gt:now}},{paymentExpiresAt:null,reservationExpiresAt:{gt:now}}];
    if(fallbackDeadline&&fallbackDeadline>now)activeDeadline.push({paymentExpiresAt:null,reservationExpiresAt:null,coachAcceptedAt:{gt:new Date(now.getTime()-24*60*60*1000)}});
    const changed=await tx.booking.updateMany({where:{id:current.id,userId:req.user!.id,kind:"private_course",status:"AWAITING_PAYMENT",OR:activeDeadline},data:{status:"CONFIRMED",paymentStatus:"pending",reservationExpiresAt:null,paymentExpiresAt:null}});
    if(!changed.count)throw Object.assign(new Error("This reservation is no longer available. Refresh your bookings."),{statusCode:409});
    await tx.paymentAttempt.updateMany({where:{resourceType:"private_course",resourceId:current.id,status:{in:["PENDING","INITIATING"]}},data:{status:"EXPIRED",failureReason:"Private course checkout is temporarily disabled."}});
    const confirmed=await tx.booking.findUniqueOrThrow({where:{id:current.id},include:{coach:true,court:true}});
    await tx.notification.create({data:{userId:req.user!.id,title:"Private course confirmed",body:`${current.title} with ${current.coach?.name||"your coach"} · ${current.date} · ${current.time} is confirmed. Payment has not been collected and will be arranged at the venue.`,link:"/bookings",audience:"member",type:"booking",icon:"check-circle",actionLabel:"View booking",entityType:"booking",entityId:current.id}});
    if(current.coach?.userId)await tx.notification.create({data:{userId:current.coach.userId,title:"Private course confirmed",body:`${current.user?.name||"A member"} confirmed ${current.title} · ${current.date} · ${current.time} · ${current.court?.name||current.location}. Payment is pending at the venue.`,link:"/coach/schedule",audience:"coach",type:"booking",icon:"calendar",entityType:"booking",entityId:current.id}});
    return confirmed;
  });
  res.json({booking,paymentStatus:"pending",message:"Booking confirmed. Payment has not been collected and will be arranged at the venue."});
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
  await expirePrivateCourseReservations();
  const attempt=await prisma.paymentAttempt.findUnique({where:{reference:payload.reference}});
  if(!attempt)return res.status(404).json({message:"Payment reference not found."});
  if(attempt.amount!==payload.amount||attempt.providerReference!==payload.providerReference)return res.status(409).json({message:"Payment does not match the initiated transaction."});
  if(attempt.status==="SUCCEEDED")return res.json({received:true});
  if(attempt.status!=="PENDING")return res.status(409).json({message:"Payment is no longer active."});
  if(attempt.expiresAt<new Date())payload.status="EXPIRED";
  if(payload.status!=="PAID"){
    await prisma.$transaction(async tx=>{
      await tx.paymentAttempt.updateMany({where:{id:attempt.id,status:"PENDING"},data:{status:payload.status==="FAILED"?"FAILED":"EXPIRED",failureReason:payload.status}});
      if(["court","booking"].includes(attempt.resourceType))await tx.booking.updateMany({where:{id:attempt.resourceId,status:"AWAITING_PAYMENT"},data:{status:"EXPIRED",reservationExpiresAt:null,paymentExpiresAt:null}});
      if(attempt.resourceType==="badminton_package")await tx.badmintonPackagePurchase.updateMany({where:{id:attempt.resourceId,status:"PENDING"},data:{status:"PAYMENT_FAILED"}});
    });return res.json({received:true});
  }
  const result=await prisma.$transaction(async tx=>{
    const changed=await tx.paymentAttempt.updateMany({where:{id:attempt.id,status:"PENDING"},data:{status:"SUCCEEDED",paidAt:new Date()}});if(!changed.count)return "already";
    const user=await tx.user.findUniqueOrThrow({where:{id:attempt.userId}});
    if(["court","private_course","booking"].includes(attempt.resourceType)){
      const booking=await tx.booking.findUnique({where:{id:attempt.resourceId},include:{court:true,coach:true}});
      const paymentDeadline=booking?.kind==="private_course"?(booking.paymentExpiresAt||booking.reservationExpiresAt):booking?.reservationExpiresAt;
      if(!booking||booking.status!=="AWAITING_PAYMENT"||paymentDeadline&&paymentDeadline<=new Date())throw Object.assign(new Error("Booking reservation expired before payment completed."),{statusCode:409});
      const updated=await tx.booking.updateMany({where:{id:booking.id,status:"AWAITING_PAYMENT"},data:{status:"CONFIRMED",paymentStatus:"paid",reservationExpiresAt:null,paymentExpiresAt:null}});if(!updated.count)throw Object.assign(new Error("Booking is no longer payable."),{statusCode:409});
      const isCourse=booking.kind==="private_course",isCourt=booking.kind==="court",business=isCourt||isCourse?"Badminton":"Gym";
      await tx.transaction.create({data:{userId:user.id,date:booking.date,customer:user.name,business,item:isCourt?`Court rental · ${booking.title}`:isCourse?`Private course · ${booking.title}`:`Personal training · ${booking.title}`,amount:attempt.amount,discount:0,tax:0,finalAmount:attempt.amount,paymentMethod:"KPay",staff:"KPay",status:"paid"}});
      await tx.notification.create({data:{userId:user.id,title:isCourt?"Court booking confirmed":isCourse?"Private course confirmed":"Training confirmed",body:`KPay payment received. ${booking.title} · ${booking.date} · ${booking.time} is confirmed.`,link:"/bookings",audience:"member",type:"booking",icon:"check-circle",imageUrl:booking.coach?.imageUrl||undefined,actionLabel:"View booking",entityType:"booking",entityId:booking.id}});
      if(booking.coach?.userId)await tx.notification.create({data:{userId:booking.coach.userId,title:isCourse?"Private course confirmed":"New training booking",body:isCourse?`${user.name}'s payment is complete. ${booking.title} · ${booking.date} · ${booking.time} · ${booking.location} is confirmed.`:`${user.name} booked ${booking.title} · ${booking.date} · ${booking.time} · ${booking.location}.`,link:"/coach/schedule",audience:"coach",type:"booking",icon:"calendar",imageUrl:booking.coach.imageUrl||undefined,actionLabel:"View schedule",entityType:"booking",entityId:booking.id}});
      return "confirmed";
    }
    if(attempt.resourceType==="badminton_package"){
      const purchase=await tx.badmintonPackagePurchase.findUnique({where:{id:attempt.resourceId},include:{package:true}});if(!purchase||purchase.status!=="PENDING")throw Object.assign(new Error("Package purchase is no longer active."),{statusCode:409});
      await tx.badmintonPackagePurchase.update({where:{id:purchase.id},data:{status:"PAID",paidAt:new Date(),paymentMethod:"KPay"}});
      const start=today(),expiry=addDaysIso(start,purchase.package.validity),enrollmentId=code("BM");
      await rawExec(tx,`INSERT INTO "BadmintonEnrollment" (id,studentId,userId,studentName,phone,packageId,packageName,sessionsTotal,sessionsRemaining,startDate,expiryDate,status,renewalCount,purchaseId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,enrollmentId,user.id,user.id,user.name,user.phone||"",purchase.packageId,purchase.packageName,purchase.package.sessions,purchase.package.sessions,start,expiry,"active",0,purchase.id);
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
  const list=await prisma.notification.findMany({where:{...(history?{}:{activeInInbox:true}),OR:[{userId:req.user!.id},{userId:null,audience:"all"},{userId:null,audience:req.user!.role}]},orderBy:{createdAt:"desc"},take:100});
  res.json(list);
}));
app.patch("/api/notifications/:id/read",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const item=await prisma.notification.findUnique({where:{id:String(req.params.id)}});
  if(!item)return res.status(404).json({message:"Notification not found"});
  if(item.userId!==req.user!.id&&!(item.userId===null&&(item.audience==="all"||item.audience===req.user!.role)))return res.status(403).json({message:"Not allowed"});
  res.json(await prisma.notification.update({where:{id:item.id},data:{read:true,activeInInbox:false}}));
}));

// Analytics
app.get("/api/analytics/overview",auth,roles("admin","owner"),asyncRoute(async(_req,res)=>{
  const [members,revenue,bookings,appointments,lowStock]=await Promise.all([
    prisma.user.count({where:{role:"member"}}),
    prisma.transaction.aggregate({where:{status:"paid"},_sum:{finalAmount:true}}),
    prisma.booking.count({where:{status:{in:["pending","confirmed","CONFIRMED"]}}}),
    prisma.appointment.count({where:{date:today()}}),
    prisma.product.count({where:{stock:{lte:5},status:"active"}})
  ]);
  const transactions=await prisma.transaction.groupBy({by:["date"],where:{status:"paid"},_sum:{finalAmount:true},orderBy:{date:"asc"},take:100});
  const byDate=transactions.map(item=>item._sum.finalAmount||0);
  res.json({members,revenue:revenue._sum.finalAmount||0,bookings,appointments,lowStock,series:byDate});
}));

app.use((_req,res)=>res.status(404).json({message:"Route not found"}));
app.use((err:any,req:Request,res:Response,_next:NextFunction)=>{
  if(err?.name==="ZodError") return res.status(400).json({message:err.issues?.map((i:any)=>`${i.path?.join(".")||"request"}: ${i.message}`).join("; ")||"Validation error",issues:err.issues});
  if(err?.code==="P2002") return res.status(409).json({message:"A record with that unique value already exists"});
  if(err?.code==="P2025") return res.status(404).json({message:"Record not found"});
  if(err?.code==="P2003") return res.status(409).json({message:"This record is linked to existing history and cannot be removed."});
  if(err?.code==="P2034"||err?.code==="P1008"||/SQLITE_BUSY|database is locked/i.test(String(err?.message||"")))return res.status(409).json({message:"Another booking is being confirmed. Refresh availability and try again."});
  if(err?.statusCode) return res.status(err.statusCode).json({message:err.message||"Request conflict",...(err.conflicts?{conflicts:err.conflicts}:{})});
  const requestId=crypto.randomUUID();
  res.setHeader("X-Request-Id",requestId);
  if(process.env.NODE_ENV==="production")console.error("Unhandled API error",{requestId,method:req.method,path:req.path,code:err?.code||null,name:err?.name||"Error"});
  else console.error(`Unhandled API error ${requestId} (${req.method} ${req.path})`,err);
  res.status(500).json({message:"Internal server error",requestId});
});

const prepareLegacySqlite=sqliteDatabase?ensureBadmintonBookingTables().then(()=>ensurePrivateCourseTables()).then(()=>ensureStorePosTables()).then(()=>ensureGymSessionTables()).then(()=>ensureCentralUserIdentity()):Promise.resolve();
prepareLegacySqlite.then(async()=>{
  await expirePrivateCourseReservations();
  app.listen(PORT,()=>{
    console.log(`Zawana API running on http://localhost:${PORT}`);
    const expirySweep=setInterval(()=>void expirePrivateCourseReservations().catch(error=>console.error("Private-course expiry sweep failed",error)),60_000);
    expirySweep.unref();
  });
}).catch((error)=>{console.error("Failed to prepare database tables",error);process.exit(1)});
