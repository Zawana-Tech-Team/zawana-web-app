
import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { PrismaClient, Role, BookingStatus, CourtStatus } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 8000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

app.use(cors({ origin: process.env.CLIENT_URL?.split(",") || ["http://localhost:5173"], credentials: true }));
app.use(express.json());

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
app.delete("/api/courts/:id",auth,roles("admin"),asyncRoute(async(req,res)=>{ await prisma.court.delete({where:{id:req.params.id}}); res.status(204).end(); }));

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

// Schedules / coach assignment
app.get("/api/schedules",auth,asyncRoute(async(_req,res)=>res.json(await prisma.schedule.findMany({include:{coach:true},orderBy:[{day:"asc"},{start:"asc"}]}))));
app.post("/api/schedules",auth,roles("admin","gym_fo","coach","doctor"),asyncRoute(async(req,res)=>{
  const b=z.object({person:z.string(),role:z.enum(["coach","doctor"]),day:z.string(),start:z.string(),end:z.string(),service:z.string().optional(),active:z.boolean().default(true),coachId:z.string().optional()}).parse(req.body);
  res.status(201).json(await prisma.schedule.create({data:b,include:{coach:true}}));
}));
app.patch("/api/schedules/:id",auth,roles("admin","gym_fo","coach","doctor"),asyncRoute(async(req,res)=>{
  const b=z.object({person:z.string().optional(),day:z.string().optional(),start:z.string().optional(),end:z.string().optional(),service:z.string().optional(),active:z.boolean().optional(),coachId:z.string().nullable().optional()}).parse(req.body);
  res.json(await prisma.schedule.update({where:{id:req.params.id},data:b,include:{coach:true}}));
}));
app.delete("/api/schedules/:id",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>{await prisma.schedule.delete({where:{id:req.params.id}});res.status(204).end()}));

// Public booking availability
app.get("/api/bookings/availability",asyncRoute(async(req,res)=>{
  const date=String(req.query.date||today());
  const courtId=String(req.query.courtId||"");
  const coachId=String(req.query.coachId||"");
  const where:any={date,status:{in:["pending","confirmed"]}};
  if(courtId) where.courtId=courtId;
  if(coachId) where.coachId=coachId;
  res.json(await prisma.booking.findMany({where,select:{id:true,date:true,time:true,courtId:true,coachId:true,status:true}}));
}));

// Bookings
app.get("/api/bookings",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const isAdmin=["admin","gym_fo","badminton_fo","coach","clinic_fo"].includes(req.user!.role);
  const where=isAdmin?{}:{userId:req.user!.id};
  res.json(await prisma.booking.findMany({where,include:{court:true,coach:true,user:{select:{id:true,name:true,email:true}}},orderBy:{createdAt:"desc"}}));
}));

app.post("/api/bookings",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({
    kind:z.enum(["court","class","pt","recovery"]),
    title:z.string(),
    date:z.string(),
    time:z.string(),
    location:z.string(),
    price:z.number().int().nonnegative(),
    courtId:z.string().optional(),
    coachId:z.string().optional(),
    meta:z.string().optional(),
    paymentStatus:z.enum(["pending","paid","refunded"]).optional()
  }).parse(req.body);
  const overlap=await prisma.booking.findFirst({where:{date:b.date,time:b.time,status:{in:["pending","confirmed"]},OR:[
    ...(b.courtId?[{courtId:b.courtId}]:[]), ...(b.coachId?[{coachId:b.coachId}]:[])
  ]}});
  if(overlap) return res.status(409).json({message:"That slot is already booked"});
  const booking=await prisma.booking.create({data:{...b,code:code("ZW"),userId:req.user!.id,status:"confirmed",paymentStatus:b.paymentStatus||"pending"}});
  await prisma.notification.create({data:{userId:req.user!.id,title:"Booking confirmed",body:`${b.title} is reserved for ${b.date} at ${b.time}.`,link:"/bookings",audience:"member",type:"booking"}});
  res.status(201).json(booking);
}));
app.patch("/api/bookings/:id/status",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const b=z.object({status:z.nativeEnum(BookingStatus)}).parse(req.body);
  const existing=await prisma.booking.findUnique({where:{id:req.params.id}});
  if(!existing) return res.status(404).json({message:"Booking not found"});
  if(!["admin","gym_fo","badminton_fo","coach"].includes(req.user!.role) && existing.userId!==req.user!.id) return res.status(403).json({message:"Not allowed"});
  res.json(await prisma.booking.update({where:{id:req.params.id},data:{status:b.status}}));
}));

// Dashboard
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
app.get("/api/packages/gym",auth,asyncRoute(async(_req,res)=>res.json(await prisma.gymPackage.findMany({orderBy:{title:"asc"}}))));
app.post("/api/packages/gym",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.gymPackage.create({data:{...req.body,benefits:req.body.benefits||[]}}))));

// Memberships
app.get("/api/memberships",auth,asyncRoute(async(_req,res)=>res.json(await prisma.membership.findMany({orderBy:{expiryDate:"asc"}}))));
app.post("/api/memberships",auth,roles("admin","gym_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.membership.create({data:req.body}))));

// Appointments
app.get("/api/appointments",auth,asyncRoute(async(_req,res)=>res.json(await prisma.appointment.findMany({orderBy:[{date:"asc"},{time:"asc"}]}))));
app.post("/api/appointments",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.appointment.create({data:req.body}))));
app.patch("/api/appointments/:id/status",auth,roles("admin","clinic_fo","doctor"),asyncRoute(async(req,res)=>{
  const b=z.object({status:z.enum(["pending","confirmed","checked_in","completed","cancelled"])}).parse(req.body);
  res.json(await prisma.appointment.update({where:{id:req.params.id},data:{status:b.status}}));
}));

// Products / inventory / orders
app.get("/api/products",asyncRoute(async(_req,res)=>res.json(await prisma.product.findMany({orderBy:{name:"asc"}}))));
app.post("/api/products",auth,roles("admin","store_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.product.create({data:req.body}))));
app.patch("/api/products/:id",auth,roles("admin","store_fo"),asyncRoute(async(req,res)=>res.json(await prisma.product.update({where:{id:req.params.id},data:req.body}))));
app.post("/api/products/:id/stock",auth,roles("admin","store_fo"),asyncRoute(async(req,res)=>{
  const b=z.object({quantity:z.number().int(),note:z.string().default("")}).parse(req.body);
  const result=await prisma.$transaction(async(tx)=>{
    const p=await tx.product.update({where:{id:req.params.id},data:{stock:{increment:b.quantity}}});
    await tx.inventoryTransaction.create({data:{productId:p.id,type:b.quantity>=0?"add":"remove",quantity:Math.abs(b.quantity),note:b.note,date:today()}});
    return p;
  });
  res.json(result);
}));
app.get("/api/inventory",auth,roles("admin","store_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.inventoryTransaction.findMany({include:{product:true},orderBy:{date:"desc"}}))));

// Cafe
app.get("/api/cafe/orders",auth,asyncRoute(async(_req,res)=>res.json(await prisma.cafeOrder.findMany({orderBy:{id:"desc"}}))));
app.post("/api/cafe/orders",auth,asyncRoute(async(req,res)=>res.status(201).json(await prisma.cafeOrder.create({data:req.body}))));
app.patch("/api/cafe/orders/:id/status",auth,roles("admin","cafe_fo"),asyncRoute(async(req,res)=>res.json(await prisma.cafeOrder.update({where:{id:req.params.id},data:{status:req.body.status}}))));

// Students
app.get("/api/students",auth,asyncRoute(async(_req,res)=>res.json(await prisma.student.findMany({orderBy:{name:"asc"}}))));
app.post("/api/students",auth,roles("admin","badminton_fo","coach"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.student.create({data:req.body}))));

// Transactions
app.get("/api/transactions",auth,roles("admin","gym_fo","badminton_fo","clinic_fo","store_fo","cafe_fo"),asyncRoute(async(_req,res)=>res.json(await prisma.transaction.findMany({orderBy:{createdAt:"desc"}}))));
app.post("/api/transactions",auth,roles("admin","gym_fo","badminton_fo","clinic_fo","store_fo","cafe_fo"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.transaction.create({data:req.body}))));

// Content
app.get("/api/content",asyncRoute(async(_req,res)=>res.json(await prisma.contentItem.findMany({orderBy:{publishDate:"desc"}}))));
app.post("/api/content",auth,roles("admin"),asyncRoute(async(req,res)=>res.status(201).json(await prisma.contentItem.create({data:req.body}))));
app.patch("/api/content/:id/publish",auth,roles("admin"),asyncRoute(async(req,res)=>res.json(await prisma.contentItem.update({where:{id:req.params.id},data:{status:"published",publishDate:today()}}))));

// Notifications
app.get("/api/notifications",auth,asyncRoute(async(req:AuthRequest,res)=>{
  const list=await prisma.notification.findMany({where:{OR:[{userId:req.user!.id},{userId:null,audience:"all"},{userId:null,audience:req.user!.role}]},orderBy:{createdAt:"desc"}});
  res.json(list);
}));
app.patch("/api/notifications/:id/read",auth,asyncRoute(async(req,res)=>res.json(await prisma.notification.update({where:{id:req.params.id},data:{read:true}}))));

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
  if(err?.name==="ZodError") return res.status(400).json({message:"Validation error",issues:err.issues});
  if(err?.code==="P2002") return res.status(409).json({message:"A record with that unique value already exists"});
  if(err?.code==="P2025") return res.status(404).json({message:"Record not found"});
  res.status(500).json({message:"Internal server error"});
});

app.listen(PORT,()=>console.log(`Zawana API running on http://localhost:${PORT}`));
