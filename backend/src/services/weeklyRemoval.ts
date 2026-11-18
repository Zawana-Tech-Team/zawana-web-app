import type { CourtBlock, Prisma, PrismaClient } from '@prisma/client';
import { bookingFailure as fail } from './courtBooking.js';
import { digest, type Actor } from './deskMoves.js';
import { today } from './courtPolicy.js';
import { addDateKeyDays } from '../utils/dateKeys.js';

/** Rescheduling records exact parent IDs in notes; class titles are never series identifiers. */
function classFamily(blocks: CourtBlock[], selected: string[]) {
  const parent = new Map(blocks.map(b => [b.id, b.note?.match(/^Moved from (.+?) · /)?.[1]]));
  const ids = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, source] of parent) {
      if (source && parent.has(source) && (ids.has(id) || ids.has(source))) {
        if (!ids.has(id)) { ids.add(id); changed = true; }
        if (!ids.has(source)) { ids.add(source); changed = true; }
      }
    }
  }
  return blocks.filter(b => ids.has(b.id));
}

export async function removeWeeklyClasses(db: PrismaClient, actor: Actor, blockIds: string[], requestKey: string) {
  if (!['admin','badminton_fo'].includes(actor.role)) throw fail(403,'Only badminton staff may remove weekly classes.');
  if (!blockIds.length || blockIds.length > 30 || new Set(blockIds).size !== blockIds.length)
    throw fail(400,'Select between 1 and 30 different weekly classes.');
  const ids = [...blockIds].sort(), payloadHash = digest({operation:'REMOVE_WEEKLY_CLASS',ids});
  return db.$transaction(async tx => {
    const previous = await tx.deskMoveBatch.findUnique({where:{actorId_requestKey:{actorId:actor.id,requestKey}}});
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw fail(409,'This retry key belongs to another operation.');
      return previous.result;
    }
    const receipt = await tx.deskMoveBatch.create({data:{actorId:actor.id,requestKey,payloadHash,reason:'Weekly class removal',result:{}}});
    const initial = await tx.courtBlock.findMany({where:{type:'class'}});
    if (ids.some(id => !initial.some(b => b.id === id))) throw fail(404,'A selected weekly class no longer exists.');
    const courtIds = [...new Set(classFamily(initial,ids).map(b => b.courtId))].sort();
    for (const courtId of courtIds) await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${courtId}`;
    const family = classFamily(await tx.courtBlock.findMany({where:{type:'class'}}),ids);
    if (ids.some(id => !family.some(b => b.id === id)) || family.some(b => !courtIds.includes(b.courtId)))
      throw fail(409,'The weekly schedule changed. Refresh and confirm removal again.');
    const date = today(), cutoff = addDateKeyDays(date,-1), current = [];
    for (const block of family) {
      const effectiveUntil = block.effectiveUntil && block.effectiveUntil < cutoff ? block.effectiveUntil : cutoff;
      // End before today even if a session has started. The row and audit preserve its history;
      // neither today nor future dates may remain an active court reservation.
      current.push(await tx.courtBlock.update({where:{id:block.id},data:{effectiveUntil}}));
    }
    const result = JSON.parse(JSON.stringify({operation:'REMOVE_WEEKLY_CLASS',selectedIds:ids,removedIds:family.map(b => b.id),from:date,previous:family,current})) as Prisma.InputJsonValue;
    await tx.deskMoveBatch.update({where:{id:receipt.id},data:{result}});
    return result;
  },{maxWait:10000,timeout:20000});
}

/** One-time compatibility repair: only classes proven removed today by an existing audit. */
export async function repairTodayWeeklyRemovals(db: PrismaClient) {
  const date = today(), cutoff = addDateKeyDays(date,-1);
  return db.$transaction(async tx => {
    const receipts = (await tx.deskMoveBatch.findMany({where:{reason:'Weekly class removal'},select:{id:true,result:true}})).filter(row=>{
      const result = row.result as Record<string,unknown> | null;
      return result?.operation==='REMOVE_WEEKLY_CLASS'&&result.from===date&&Array.isArray(result.removedIds);
    });
    const ids = [...new Set(receipts.flatMap(row=>(row.result as {removedIds:unknown[]}).removedIds.filter((id):id is string=>typeof id==='string')))];
    const where = {id:{in:ids},type:'class',active:true,effectiveUntil:date};
    const initial = await tx.courtBlock.findMany({where});
    for(const id of [...new Set(initial.map(row=>row.courtId))].sort())await tx.$executeRaw`UPDATE "Court" SET status=status WHERE id=${id}`;
    const previous = await tx.courtBlock.findMany({where,orderBy:{id:'asc'}});
    if(!previous.length)return {date,removedIds:[] as string[]};
    await tx.courtBlock.updateMany({where:{...where,id:{in:previous.map(row=>row.id)}},data:{effectiveUntil:cutoff}});
    const removedIds=previous.map(row=>row.id);
    const result={operation:'REPAIR_TODAY_WEEKLY_REMOVAL',date,cutoff,removedIds,sourceBatchIds:receipts.map(row=>row.id),previous};
    const payloadHash=digest({date,removedIds});
    await tx.deskMoveBatch.create({data:{actorId:'SYSTEM',requestKey:`weekly-removal-today:${payloadHash}`,payloadHash,reason:'Repair today weekly removal',result:JSON.parse(JSON.stringify(result))}});
    return {date,removedIds};
  },{maxWait:10000,timeout:20000});
}
