import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { today } from '../src/services/courtPolicy.js';
if (!process.env.DATABASE_URL?.includes('zawana-private-browser-') || !process.env.PRIVATE_QA_FIXTURE_PATH)
  throw new Error('Court fixtures require an isolated temporary database.');
const db = new PrismaClient();
try {
  const member = await db.user.create({ data: { name: 'Court QA Member', email: 'member@court.test', role: 'member' } });
  const courts = [];
  for (let i = 1; i <= 8; i++) courts.push(await db.court.create({ data: { name: `Court ${i}`, price: 20000, type: 'Standard', surface: 'Indoor', features: [], status: 'available' } }));
  const dates = [1, 2].map(offset => { const date = new Date(`${today()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10) });
  const coachUser = await db.user.create({ data: { name: 'Aye Coach', email: 'coach@private.test', role: 'coach' } });
  const coach = await db.coach.create({ data: { name: coachUser.name, userId: coachUser.id, department: 'Badminton', specialty: 'Footwork & technique', phone: '', email: coachUser.email, status: 'active' } });
  const course = await db.privateCourse.create({ data: { title: 'Personal badminton', description: 'Build confidence and technique with individual coaching.', duration: 90, price: 50000, coaches: { connect: { id: coach.id } } } });
  const token = (await createSessionService(db).issue(db, member, 'database_password', [])).accessToken;
  const staff = await db.user.create({ data: { name: 'FO Cashier', email: 'staff@course.test', role: 'badminton_fo' } });
  const staffToken = (await createSessionService(db).issue(db, staff, 'database_password', [])).accessToken;
  const coachToken = (await createSessionService(db).issue(db, coachUser, 'database_password', [])).accessToken;
  writeFileSync(process.env.PRIVATE_QA_FIXTURE_PATH, JSON.stringify({ token, dates, courts, coach, course, staffToken, coachToken }));
} finally { await db.$disconnect(); }
