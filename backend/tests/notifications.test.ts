import { randomUUID } from 'node:crypto';
import { notifyBadmintonStaff } from '../src/services/notificationEvents.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { createNotificationRouter } from '../src/routes/notifications.js';
import { createSessionService } from '../src/services/authSession.js';
import { createAuthMiddleware } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

test('notifications automatically archive viewed, expired and completed items', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-notifications-')), file = join(dir, 'test.db');
  const sqlite = new DatabaseSync(file), root = new URL('../prisma/migrations/', import.meta.url);
  for (const name of readdirSync(root).filter(n => /^\d/.test(n)).sort()) sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, root), 'utf8'));
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  const [admin, otherAdmin, member] = await Promise.all(['admin', 'admin', 'member'].map((role, i) => db.user.create({ data: { name: `Inbox ${i}`, email: `inbox${i}@test.local`, role: role as 'admin' | 'member' } })));
  const sessions = createSessionService(db), tokens = new Map(await Promise.all([admin, otherAdmin, member].map(async u => [u.id, (await sessions.issue(db, u, 'database_password', [])).accessToken] as const)));
  const app = express(); app.use(express.json()); app.use('/notifications', createNotificationRouter(db, createAuthMiddleware(sessions))); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const request = async (u: { id: string }, path = '/notifications', body?: unknown) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${tokens.get(u.id)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const notice = (title: string, extra = {}) => db.notification.create({ data: { title, body: title, userId: admin.id, ...extra } });
  try {
    await t.test('viewed items disappear persistently for only their recipient', async () => {
      const shared = await notice('Shared view', { userId: null, audience: 'admin', read: true }), unread = await notice('Not viewed');
      assert.equal((await request(admin, '/notifications/read', { ids: [shared.id] })).status, 200);
      assert.equal((await request(admin, '/notifications/read', { ids: [shared.id] })).status, 200);
      await db.$disconnect();
      const mine = (await request(admin)).data;
      assert.equal(mine.some((n: any) => n.id === shared.id), false); assert.equal(mine.some((n: any) => n.id === unread.id), true);
      assert.equal((await request(otherAdmin)).data.some((n: any) => n.id === shared.id), true);
      assert.equal(await db.notificationRead.count({ where: { notificationId: shared.id } }), 1);
      assert.ok(await db.notification.findUnique({ where: { id: shared.id } }));
    });
    await t.test('batch read rejects unauthorized IDs atomically', async () => {
      const own = await notice('Own unread'), privateItem = await notice('Private member', { userId: member.id });
      assert.equal((await request(admin, '/notifications/read', { ids: [own.id, privateItem.id] })).status, 404);
      assert.equal(await db.notificationRead.count({ where: { notificationId: own.id } }), 0);
      assert.equal((await request(member)).data.some((n: any) => n.id === own.id), false);
    });
    await t.test('general updates expire after seven days and stay in history', async () => {
      const old = await notice('Old update', { createdAt: new Date(Date.now() - 8 * 86400000) }), fresh = await notice('Fresh update');
      const inbox = (await request(admin)).data;
      assert.equal(inbox.some((n: any) => n.id === old.id), false); assert.equal(inbox.some((n: any) => n.id === fresh.id), true);
      const history = (await request(admin, '/notifications?history=1')).data;
      assert.equal(history.find((n: any) => n.id === old.id).activeInInbox, false);
    });
    await t.test('expired reservation and resolved request/payment stages archive without being opened', async () => {
      const booking = await db.booking.create({ data: { code: 'INBOX-BOOKING', userId: member.id, kind: 'private_course', title: 'Private course', date: '2099-01-01', time: '10:00 — 11:00', location: 'Court', price: 100, status: 'PENDING_COACH_CONFIRMATION', reservationExpiresAt: new Date(Date.now() + 60000) } });
      const requestNotice = await notice('New private course request', { entityType: 'booking', entityId: booking.id });
      assert.equal((await request(admin)).data.some((n: any) => n.id === requestNotice.id), true);
      await db.booking.update({ where: { id: booking.id }, data: { status: 'AWAITING_PAYMENT', paymentExpiresAt: new Date(Date.now() + 60000) } });
      const payment = await notice('Coach confirmed your private course', { entityType: 'booking', entityId: booking.id });
      assert.equal((await request(admin)).data.some((n: any) => n.id === requestNotice.id), false);
      assert.equal((await request(admin)).data.some((n: any) => n.id === payment.id), true);
      await db.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED', paymentStatus: 'paid' } });
      assert.equal((await request(admin)).data.some((n: any) => n.id === payment.id), false);
      const expired = await notice('Reservation reminder', { entityType: 'booking', entityId: booking.id });
      await db.booking.update({ where: { id: booking.id }, data: { status: 'AWAITING_PAYMENT', paymentExpiresAt: new Date(0) } });
      assert.equal((await request(admin)).data.some((n: any) => n.id === expired.id), false);
      const done = await notice('Booking task', { entityType: 'booking', entityId: booking.id });
      await db.booking.update({ where: { id: booking.id }, data: { status: 'completed' } });
      assert.equal((await request(admin)).data.some((n: any) => n.id === done.id), false);
      assert.equal((await db.notification.findUniqueOrThrow({ where: { id: done.id } })).activeInInbox, false);
      const outcome=await notice('Coach declined your private course',{userId:member.id,audience:'member',entityType:'booking',entityId:booking.id});
      assert.equal((await request(member)).data.some((row:any)=>row.id===outcome.id),true,'Informational outcomes must remain visible after the booking becomes terminal');
    });
    await t.test('group notices show remaining requests, archive handled groups and isolate recipients',async()=>{
      const batch=await db.bookingRequestBatch.create({data:{id:randomUUID(),senderId:admin.id,recipientId:member.id,reason:'MAINTENANCE'}});
      const children=[];
      for(let index=0;index<3;index++){
        const booking=await db.booking.create({data:{code:`NOTIFICATION-GROUP-${index}`,userId:member.id,kind:'court',title:'Rental',date:'2099-01-01',time:'8:00 AM — 9:00 AM',location:'Court',price:100,status:'CONFIRMED'}});
        children.push(await db.bookingRescheduleRequest.create({data:{batchId:batch.id,bookingId:booking.id,activeKey:booking.id,customerId:member.id,requestedById:admin.id,kind:'court',oldSchedule:{},reason:'MAINTENANCE',expiresAt:new Date(Date.now()+86400000)}}));
      }
      const grouped=await db.notification.create({data:{userId:member.id,audience:'member',title:'Original title',body:'Original body',entityType:'reschedule_batch',entityId:batch.id,link:`/bookings?batch=${batch.id}`}});
      const individual=await db.notification.create({data:{userId:member.id,audience:'member',title:'Reschedule Request',body:'Choose a response',entityType:'reschedule_request',entityId:children[0].id}});
      let visible=(await request(member)).data.find((row:any)=>row.id===grouped.id);assert.equal(visible.title,'3 Requests');assert.match(visible.body,/Dear Valued Customer/);assert.match(visible.link,new RegExp(batch.id));
      assert.equal((await request(otherAdmin)).data.some((row:any)=>row.id===grouped.id),false);
      await db.bookingRescheduleRequest.update({where:{id:children[0].id},data:{status:'ADMIN_HANDLING',response:'ADMIN_HANDLING'}});
      visible=(await request(member)).data.find((row:any)=>row.id===grouped.id);assert.equal(visible.title,'2 Requests');assert.match(visible.body,/2 Requests awaiting response/);
      assert.equal((await request(member)).data.some((row:any)=>row.id===individual.id),false);
      await db.bookingRescheduleRequest.updateMany({where:{batchId:batch.id},data:{status:'COMPLETED',activeKey:null}});
      assert.equal((await request(member)).data.some((row:any)=>row.id===grouped.id),false);
      assert.equal((await request(member,'/notifications?history=1')).data.some((row:any)=>row.id===grouped.id),true);
    });
    await t.test('event retries do not duplicate staff notices or reset another administrator’s read state',async()=>{
      const send=()=>db.$transaction(tx=>notifyBadmintonStaff(tx,'retry-event','Customer requested assistance','Booking reference only','?request=owned-id','system_event','event-id'));
      await send();await send();assert.equal(await db.notification.count({where:{dedupeKey:{startsWith:'badminton:retry-event:'}}}),2);
      const row=await db.notification.findUniqueOrThrow({where:{dedupeKey:'badminton:retry-event:admin'}});
      assert.match(row.link!,/^\/admin\/court-rentals\?request=/);
      assert.equal((await request(admin,'/notifications/read',{ids:[row.id]})).status,200);await send();
      assert.equal((await request(admin)).data.some((item:any)=>item.id===row.id),false);
      assert.equal((await request(otherAdmin)).data.some((item:any)=>item.id===row.id),true);
      assert.equal((await request(member)).data.some((item:any)=>item.id===row.id),false);
    });
    await t.test('QR expiry and revocation remove stale QR notices', async () => {
      const qr = await db.badmintonEntryQr.create({ data: { tokenHash: 'notification-test-hash', createdById: admin.id, kind: 'CATEGORY', categoryCode: 'SOCIAL', expiresAt: new Date(Date.now() + 60000) } });
      const qrNotice = await notice('QR expiring', { entityType: 'badminton-qr', entityId: qr.id });
      assert.equal((await request(admin)).data.some((n: any) => n.id === qrNotice.id), true);
      await db.badmintonEntryQr.update({ where: { id: qr.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
      assert.equal((await request(admin)).data.some((n: any) => n.id === qrNotice.id), false);
    });
  } finally { await new Promise<void>(r => server.close(() => r())); await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); }
});
