import { Router } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { auth, roles } from '../middleware/auth.js';
import type { AuthRequest } from '../types/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { isDateKey } from '../utils/dateKeys.js';
import { blockOccurs, blocksShareDate } from '../services/blockSchedule.js';
import { bookingFailure, occupyingStatuses } from '../services/courtBooking.js';
import { overlaps, today } from '../services/courtPolicy.js';
import { categoryCodeInput } from '../services/badmintonCategory.js';
import { digest } from '../services/deskMoves.js';
const dateInput = z.string().refine(isDateKey, 'Choose a valid local date.');
const datesInput = z.array(dateInput).min(1).max(366).transform(dates => [...new Set(dates)].sort());
const holidayInput=z.object({dates:datesInput,categoryCodes:z.array(categoryCodeInput).min(1).max(100).transform(codes=>[...new Set(codes)].sort()).nullable().default(null),name:z.string().trim().min(1).max(120).default('Holiday'),notes:z.string().trim().max(2000).default(''),sourceDates:z.array(dateInput).max(366).transform(dates=>[...new Set(dates)].sort()).default([])}).strict();
async function preview(tx: Prisma.TransactionClient, dates: string[], categoryCodes:string[]|null=null,sourceDates:string[]=[]) {
  if(categoryCodes&&(await tx.badmintonPackageCategory.count({where:{code:{in:categoryCodes}}}))!==new Set(categoryCodes).size)throw bookingFailure(400,'Choose registered class categories.');
  const affectedDates=[...new Set([...dates,...sourceDates])].sort();
  if(affectedDates.some(date=>date<today()))throw bookingFailure(409,'Past holiday schedules are read-only.');
  const [blocks, overrides] = await Promise.all([tx.courtBlock.findMany({ where: { active: true, type: 'class' }, include: { court: { select: { name: true } } }, orderBy: { id: 'asc' } }), tx.courtDateOverride.findMany({ where: { date: { in: affectedDates } }, orderBy: { date: 'asc' } })]);
  if (overrides.some(o => o.type === 'closed')) throw bookingFailure(409, 'A selected date has an existing facility closure. Holiday management does not change closures.');
  if(sourceDates.some(date=>!overrides.some(o=>o.date===date&&o.type==='open')))throw bookingFailure(409,'An edited holiday no longer exists. Reload the holiday list.');
  if(sourceDates.length&&dates.some(date=>!sourceDates.includes(date)&&overrides.some(o=>o.date===date&&(o.holidayActive||!o.weeklyOnly||Array.isArray(o.suspendedBlockIds)&&o.suspendedBlockIds.length))))throw bookingFailure(409,'A replacement date already has a holiday or suspended restoration. Edit that date separately.');
  const removedDays=await Promise.all(sourceDates.filter(date=>!dates.includes(date)).map(async date=>{const existing=overrides.find(o=>o.date===date)!;return {date,restorationConflicts:await restorationConflicts(tx,date,existing,[])};}));
  const days = await Promise.all(dates.map(async date => ({ date, restorationConflicts:overrides.find(o=>o.date===date)?await restorationConflicts(tx,date,overrides.find(o=>o.date===date)!,categoryCodes):[], sessions: blocks.filter(b => blockOccurs(b, date)&&(!categoryCodes||categoryCodes.includes(b.categoryCode||''))).map(b => ({ id: b.id, courtId: b.courtId, courtName: b.court.name, title: b.title, categoryCode:b.categoryCode, start: b.start, end: b.end })) })));
  return { days, removedDays, count: days.reduce((n, d) => n + d.sessions.length, 0), revision: digest({ days, removedDays, overrides,categoryCodes,sourceDates }) };
}
async function restorationConflicts(tx:Prisma.TransactionClient,date:string,existing:{type:string;weeklyOnly:boolean;holidayActive:boolean;categoryCodes:unknown;suspendedBlockIds:unknown},newCategories:string[]|null){
 const [classes,bookings,blocks]=await Promise.all([tx.courtBlock.findMany({where:{active:true,type:'class'},include:{court:{select:{name:true}}}}),tx.booking.findMany({where:{date,status:{in:occupyingStatuses}}}),tx.courtBlock.findMany({where:{active:true,type:{not:'class'}}})]);
 const remaining=classes.filter(c=>blockOccurs(c,date)&&newCategories!==null&&!newCategories.includes(c.categoryCode||''));
 return remaining.filter(c=>!blockOccurs(c,date,existing)&&(bookings.some(b=>b.courtId===c.courtId&&overlaps(b.time,`${c.start} — ${c.end}`))||blocks.some(b=>b.courtId===c.courtId&&blockOccurs(b,date)&&overlaps(`${b.start} — ${b.end}`,`${c.start} — ${c.end}`))||remaining.some(b=>b.id!==c.id&&b.courtId===c.courtId&&overlaps(`${b.start} — ${b.end}`,`${c.start} — ${c.end}`))));
}
async function removalPreview(tx:Prisma.TransactionClient,date:string){
 if(date<today())throw bookingFailure(409,'Past holiday schedules are read-only.');
 const existing=await tx.courtDateOverride.findUnique({where:{date}});
 if(!existing||existing.type!=='open')throw bookingFailure(404,'Holiday override not found.');
 const conflicts=await restorationConflicts(tx,date,existing,[]);
 return {date,existing,conflicts,revision:digest({date,existing,conflicts})};
}
async function notifyMembers(tx:Prisma.TransactionClient,date:string,categoryWhere:Prisma.BadmintonEnrollmentWhereInput,title:string,body:string){
 const enrollments=await tx.badmintonEnrollment.findMany({where:{status:'active',sessionsRemaining:{gt:0},startDate:{lte:date},expiryDate:{gte:date},...categoryWhere},select:{userId:true,studentId:true}});
 const ids=[...new Set(enrollments.map(e=>e.userId||e.studentId))];
 const users=await tx.user.findMany({where:{id:{in:ids},role:'member',active:true,deletedAt:null},select:{id:true}});
 await tx.notification.createMany({data:users.map(u=>({userId:u.id,title,body,link:'/membership',type:'booking'}))});
}
async function restoreDate(tx:Prisma.TransactionClient,date:string,actorId:string){
 const {existing,conflicts}=await removalPreview(tx,date);
 await tx.courtDateOverride.update({where:{date},data:{weeklyOnly:true,holidayActive:false,suspendedBlockIds:conflicts.map(c=>c.id),title:conflicts.length?'Weekly restoration pending':'Holiday removed'}});
 await tx.attendanceModification.create({data:{bookingId:`holiday:${date}`,actorId,reason:'Holiday removed; restoration conflicts retained',previous:JSON.stringify(existing),current:JSON.stringify({holidayActive:false,suspendedBlockIds:conflicts.map(c=>c.id)})}});
 if(existing.holidayActive)await notifyMembers(tx,date,Array.isArray(existing.categoryCodes)?{categoryCode:{in:existing.categoryCodes.filter((code):code is string=>typeof code==='string')}}:{},'Class holiday removed',`${existing.title} · ${date}. The holiday has been removed. Classes resume where courts are available; check the latest schedule before attending. Package balances are unchanged.`);
 return conflicts;
}
export function createHolidayRouter(db: PrismaClient, authenticate = auth) {
  const r = Router(); r.use(authenticate, roles('admin', 'badminton_fo'));
  r.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  r.get('/classes',asyncRoute(async(_req,res)=>res.json(await db.courtBlock.findMany({where:{active:true,type:'class'},include:{court:{select:{name:true}}},orderBy:{title:'asc'}}))));
  r.patch('/classes/:id/category',asyncRoute(async(req:AuthRequest,res)=>{
    const {categoryCode}=z.object({categoryCode:categoryCodeInput}).strict().parse(req.body);
    res.json(await db.$transaction(async tx=>{
      const initial=await tx.courtBlock.findUnique({where:{id:String(req.params.id)}});if(!initial||initial.type!=='class')throw bookingFailure(404,'Class not found.');
      await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${initial.courtId}`;
      const before=await tx.courtBlock.findUniqueOrThrow({where:{id:initial.id}});
      if(before.courtId!==initial.courtId)throw bookingFailure(409,'This class moved while its category was being edited. Reload and try again.');
      if(!await tx.badmintonPackageCategory.findFirst({where:{code:categoryCode,active:true}}))throw bookingFailure(400,'Choose an active category.');
      const updated=await tx.courtBlock.update({where:{id:initial.id},data:{categoryCode}});
      const overrides=new Map((await tx.courtDateOverride.findMany()).map(o=>[o.date,o]));
      const [bookings,others]=await Promise.all([tx.booking.findMany({where:{courtId:initial.courtId,date:{gte:today()},status:{in:occupyingStatuses}}}),tx.courtBlock.findMany({where:{courtId:initial.courtId,active:true,id:{not:initial.id}}})]);
      if(bookings.some(b=>blockOccurs(updated,b.date,overrides.get(b.date))&&overlaps(b.time,`${updated.start} — ${updated.end}`))||others.some(b=>blocksShareDate(updated,b,today(),overrides)&&overlaps(`${b.start} — ${b.end}`,`${updated.start} — ${updated.end}`)))throw bookingFailure(409,'Changing this category would restore a class into an occupied slot. Resolve the conflict first.');
      await tx.attendanceModification.create({data:{bookingId:`class-category:${initial.id}`,actorId:req.user!.id,reason:'Class category assigned',previous:JSON.stringify(before),current:JSON.stringify(updated)}});
      return updated;
    }));
  }));
  r.get('/:date/removal-preview',asyncRoute(async(req,res)=>{
    const date=dateInput.parse(req.params.date);
    const {conflicts,revision}=await db.$transaction(tx=>removalPreview(tx,date));
    res.json({date,conflicts,revision});
  }));
  r.get('/', asyncRoute(async (_req, res) => res.json(await db.courtDateOverride.findMany({ where: { OR: [{ weeklyOnly: true }, { type: 'open' }] }, orderBy: { date: 'asc' } }))));
  r.post('/preview', asyncRoute(async (req, res) => { const { dates,categoryCodes,sourceDates } = holidayInput.parse(req.body); res.json(await db.$transaction(tx => preview(tx, dates,categoryCodes,sourceDates))); }));
  r.post('/', asyncRoute(async (req: AuthRequest, res) => {
    const { dates, categoryCodes,name,notes,sourceDates,revision } = holidayInput.extend({revision:z.string().min(1)}).parse(req.body);
    res.status(201).json(await db.$transaction(async tx => {
      // Same court-lock order as bookings and rescheduling; changes are all-or-nothing.
      for (const c of await tx.court.findMany({ orderBy: { id: 'asc' }, select: { id: true } })) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${c.id}`;
      const current = await preview(tx, dates,categoryCodes,sourceDates);
      if (current.revision !== revision) throw bookingFailure(409, 'The weekly schedule changed. Review the holiday preview again.');
      for(const day of current.removedDays)await restoreDate(tx,day.date,req.user!.id);
      for (const date of dates){
        const before=await tx.courtDateOverride.findUnique({where:{date}});
        const suspended=before?await restorationConflicts(tx,date,before,categoryCodes):[];
        const data={type:'open' as const,title:name,reason:notes,categoryCodes:categoryCodes||undefined,weeklyOnly:true,holidayActive:true,suspendedBlockIds:suspended.map(c=>c.id),createdById:req.user!.id};
        await tx.courtDateOverride.upsert({where:{date},create:{...data,date},update:{...data,categoryCodes:categoryCodes||Prisma.JsonNull}});
        await tx.attendanceModification.create({data:{bookingId:`holiday:${date}`,actorId:req.user!.id,reason:'Holiday configuration updated',previous:JSON.stringify(before),current:JSON.stringify(data)}});
        if(before?.holidayActive&&categoryCodes){
          const previousCodes=Array.isArray(before.categoryCodes)?before.categoryCodes.filter((code):code is string=>typeof code==='string'):null;
          const removedScope:Prisma.BadmintonEnrollmentWhereInput=previousCodes?{categoryCode:{in:previousCodes.filter(code=>!categoryCodes.includes(code))}}:{OR:[{categoryCode:{notIn:categoryCodes}},{categoryCode:null}]};
          await notifyMembers(tx,date,removedScope,'Class holiday updated',`${before.title} · ${date}. Holiday coverage changed for your category. Check the latest schedule before attending; conflicting classes may remain suspended. Package balances are unchanged.`);
        }
        if(!before?.holidayActive||JSON.stringify(before.categoryCodes)!==JSON.stringify(categoryCodes)||before.title!==name){
          await notifyMembers(tx,date,categoryCodes?{categoryCode:{in:categoryCodes}}:{},'Class holiday notice',`${name} · ${date}. Applicable weekly classes are suspended. No package session is deducted.`);
        }
      }
      return current;
    }, { maxWait: 10000, timeout: 20000 }));
  }));
  r.delete('/:date', asyncRoute(async (req:AuthRequest, res) => {
    const date = dateInput.parse(req.params.date);
    if(date<today())throw bookingFailure(409,'Past holiday schedules are read-only.');
    res.json(await db.$transaction(async tx => {
      for (const c of await tx.court.findMany({ orderBy: { id: 'asc' }, select: { id: true } })) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${c.id}`;
      const input=z.object({revision:z.string().min(1).optional()}).strict().parse(req.body||{});
      const reviewed=await removalPreview(tx,date);
      if(input.revision&&input.revision!==reviewed.revision)throw bookingFailure(409,'The holiday or restoration conflicts changed. Review removal again.');
      const conflicts=await restoreDate(tx,date,req.user!.id);
      return { date, conflicts: conflicts.map(c => ({ id: c.id, courtName: c.court.name, courtId: c.courtId, title: c.title, start: c.start, end: c.end })), message: conflicts.length ? `${conflicts.length} conflicting weekly sessions remain suspended. Resolve the bookings and retry restoration.` : 'Holiday removed. Weekly classes restored.' };
    }, { maxWait: 10000, timeout: 20000 }));
  }));
  r.get('/:date/classes', asyncRoute(async (req, res) => { const date = dateInput.parse(req.params.date); const blocks = await db.courtBlock.findMany({ where: { active: true, type: 'class' }, include: { court: { select: { name: true } } } }); const override = await db.courtDateOverride.findUnique({ where: { date } }); res.json(blocks.filter(b => blockOccurs(b, date) && !blockOccurs(b, date, override)).map(b => ({ ...b, status: 'Holiday / Overridden' }))); }));
  return r;
}
