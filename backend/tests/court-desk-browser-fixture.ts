import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { today } from '../src/services/courtPolicy.js';

if (!process.env.DATABASE_URL?.includes('zawana-court-desk-') || !process.env.COURT_DESK_FIXTURE)
  throw new Error('Court desk fixtures require an isolated temporary database.');
const db = new PrismaClient();
try {
  const admin = await db.user.create({ data: { name: 'Desk Preview', email: 'desk@example.test', role: 'admin' } });
  const member = await db.user.create({ data: { name: 'Alex Tan', email: 'member@example.test', role: 'member' } });
  const fo = await db.user.create({ data: { name: 'Desk Cashier', email: 'cashier@example.test', role: 'badminton_fo' } });
  const coachUser = await db.user.create({ data: { name: 'Coach Lin', email: 'coach@example.test', role: 'coach' } });
  const otherCoach = await db.user.create({ data: { name: 'Other Coach', email: 'other-coach@example.test', role: 'coach' } });
  const coach = await db.coach.create({ data: { name: coachUser.name, userId: coachUser.id, specialty: 'Badminton', phone: '', email: coachUser.email!, department: 'Badminton' } });
  await db.coach.create({ data: { name: otherCoach.name, userId: otherCoach.id, specialty: 'Badminton', phone: '', email: otherCoach.email!, department: 'Badminton' } });
  const course = await db.privateCourse.create({ data: { title: 'Private Fundamentals', duration: 60, price: 65000, coaches: { connect: { id: coach.id } } } });
  const courts = [];
  for (const name of ['Court 1', 'Court 5', 'Training Studio', 'Court 2', 'Court 3', 'Court 4', 'Court 6', 'Court 7']) courts.push(await db.court.create({ data: { name, type: 'Standard', surface: 'Indoor', price: 20000, status: 'available', features: [] } }));
  const future = new Date(`${today()}T12:00:00Z`); future.setUTCDate(future.getUTCDate() + 2);
  const date = future.toISOString().slice(0, 10), dayOfWeek = future.getUTCDay();
  const booking = await db.booking.create({ data: { code: 'DESK-PREVIEW-1', userId: member.id, kind: 'court', courtId: courts[0].id, title: courts[0].name, date, time: '9:00 AM — 11:00 AM', location: 'Zawana Badminton Arena', price: 40000, status: 'confirmed', paymentStatus: 'pending' } });
  await db.booking.create({ data: { code: 'DESK-PREVIEW-2', userId: member.id, kind: 'court', courtId: courts[1].id, title: courts[1].name, date, time: '11:00 AM — 12:00 PM', location: 'Zawana Badminton Arena', price: 20000, status: 'pending', paymentStatus: 'pending' } });
  await db.courtBlock.create({ data: { courtId: courts[0].id, date: '', dayOfWeek, start: '13:00', end: '15:30', title: 'Junior Academy', type: 'class', active: true } });
  await db.courtBlock.create({ data: { courtId: courts[1].id, date, start: '18:00', end: '19:00', title: 'Court maintenance', type: 'maintenance', active: true } });
  const token = (await createSessionService(db).issue(db, admin, 'database_password', [])).accessToken;
  const session = async (user: typeof member) => (await createSessionService(db).issue(db, user, 'database_password', [])).accessToken;
  writeFileSync(process.env.COURT_DESK_FIXTURE, JSON.stringify({ token, date, courts, bookingId: booking.id, dayOfWeek, memberId: member.id, coachId: coach.id, courseId: course.id,
    memberToken: await session(member), foToken: await session(fo), coachToken: await session(coachUser), otherCoachToken: await session(otherCoach) }));
} finally { await db.$disconnect(); }
