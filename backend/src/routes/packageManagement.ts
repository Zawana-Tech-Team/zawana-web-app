import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { categoryCodeInput } from '../services/badmintonCategory.js';
import { recordPackageMutation } from '../services/packageSecurity.js';
import { bookingFailure } from '../services/courtBooking.js';
import { today } from '../services/courtPolicy.js';
const categoryInput=z.object({name:z.string().trim().min(1).max(120),description:z.string().trim().max(2000).default(''),code:categoryCodeInput}).strict();
async function uniqueName(tx:Prisma.TransactionClient,name:string,id?:string){
 await tx.$executeRaw`UPDATE "CategoryMutationLock" SET id=id WHERE id=1`;
 const categories=await tx.badmintonPackageCategory.findMany({select:{id:true,name:true}});
 if(categories.some(c=>c.id!==id&&c.name.normalize('NFKC').trim().toLowerCase()===name.normalize('NFKC').trim().toLowerCase()))throw bookingFailure(409,'A category with this name already exists.');
}
export function createPackageManagementRouter(db:PrismaClient,authenticate=auth){
 const r=Router();r.use(authenticate);r.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 r.get('/categories',asyncRoute(async(req:AuthRequest,res)=>res.json(await db.badmintonPackageCategory.findMany({where:['admin','owner','badminton_fo'].includes(req.user!.role)?{}:{active:true},orderBy:{name:'asc'}}))));
 r.post('/categories',roles('admin'),asyncRoute(async(req:AuthRequest,res)=>{
  const input=categoryInput.parse(req.body);
  const row=await db.$transaction(async tx=>{await uniqueName(tx,input.name);if(await tx.badmintonPackageCategory.findUnique({where:{code:input.code}}))throw bookingFailure(409,'This stable category code already exists.');const row=await tx.badmintonPackageCategory.create({data:{...input,createdBy:req.user!.id}});await recordPackageMutation(tx,req.user!.id,'badminton',null,row,res.locals.packageAuditId);return row;});res.status(201).json(row);
 }));
 r.patch('/categories/:id',roles('admin'),asyncRoute(async(req:AuthRequest,res)=>{
  const input=categoryInput.omit({code:true}).partial().extend({active:z.boolean().optional()}).strict().parse(req.body);
  res.json(await db.$transaction(async tx=>{const before=await tx.badmintonPackageCategory.findUnique({where:{id:String(req.params.id)}});if(!before)throw bookingFailure(404,'Category not found.');if(input.name)await uniqueName(tx,input.name,before.id);const row=await tx.badmintonPackageCategory.update({where:{id:before.id},data:input});await recordPackageMutation(tx,req.user!.id,'badminton',before,row,res.locals.packageAuditId);return row;}));
 }));
 r.delete('/categories/:id',roles('admin'),asyncRoute(async(req:AuthRequest,res)=>{
  const row=await db.$transaction(async tx=>{const before=await tx.badmintonPackageCategory.findUnique({where:{id:String(req.params.id)}});if(!before)throw bookingFailure(404,'Category not found.');const row=await tx.badmintonPackageCategory.update({where:{id:before.id},data:{active:false}});await recordPackageMutation(tx,req.user!.id,'badminton',before,row,res.locals.packageAuditId);return row;});res.json({...row,message:'Category archived. Package, class and attendance history is preserved. Existing entitlements remain usable.'});
 }));
 r.get('/:id/members',roles('admin','badminton_fo'),asyncRoute(async(req,res)=>{
  const q=z.object({page:z.coerce.number().int().min(1).max(1000000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),q:z.string().trim().max(120).default(''),status:z.enum(['active','expired','all']).default('active'),categoryCode:categoryCodeInput.optional()}).parse(req.query);
  const matchingAccounts=q.q?await db.user.findMany({where:{role:'member',OR:[{name:{contains:q.q}},{phone:{contains:q.q}},{email:{contains:q.q}}]},select:{id:true}}):[];
  const date=today();const where:Prisma.BadmintonEnrollmentWhereInput={packageId:String(req.params.id),...(q.categoryCode?{categoryCode:q.categoryCode}:{}),...(q.status==='active'?{status:'active',startDate:{lte:date},expiryDate:{gte:date},sessionsRemaining:{gt:0}}:q.status==='expired'?{OR:[{status:'expired'},{expiryDate:{lt:date}}]}:{}),...(q.q?{AND:[{OR:[{studentName:{contains:q.q}},{phone:{contains:q.q}},{AND:[{userId:null},{studentId:{in:matchingAccounts.map(account=>account.id)}}]},{user:{is:{OR:[{name:{contains:q.q}},{phone:{contains:q.q}},{email:{contains:q.q}}]}}}]}]}:{})};
  if(!await db.badmintonPackage.findUnique({where:{id:String(req.params.id)},select:{id:true}}))throw bookingFailure(404,'Package not found.');
  const [total,rows]=await db.$transaction([db.badmintonEnrollment.count({where}),db.badmintonEnrollment.findMany({where,skip:(q.page-1)*q.pageSize,take:q.pageSize,orderBy:[{studentName:'asc'},{id:'asc'}],include:{user:{select:{id:true,name:true,phone:true,email:true}}}})]);
  // Legacy memberships may identify an existing member by studentId rather than userId.
  const legacyIds=rows.filter(row=>!row.userId).map(row=>row.studentId);
  const legacyUsers=legacyIds.length?await db.user.findMany({where:{id:{in:legacyIds},role:'member'},select:{id:true,name:true,phone:true,email:true}}):[];
  const legacyById=new Map(legacyUsers.map(user=>[user.id,user]));
  res.json({total,page:q.page,pageSize:q.pageSize,rows:rows.map(({user,...e})=>{const account=user||legacyById.get(e.studentId);return {...e,member:{id:account?.id||null,name:account?.name||e.studentName,phone:account?.phone||e.phone||null,email:account?.email||null},status:e.status!=='active'?e.status:e.expiryDate<date?'expired':e.startDate>date?'scheduled':e.sessionsRemaining<=0?'exhausted':'active'};})});
 }));return r;
}
