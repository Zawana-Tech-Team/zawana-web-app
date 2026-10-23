import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { today } from '../src/services/courtPolicy.js';
if (!process.env.DATABASE_URL?.includes('zawana-attendance-browser-') || !process.env.ATTENDANCE_QA_FIXTURE_PATH) throw new Error('Isolated attendance database required.');
const db = new PrismaClient();
try {
  const users = await Promise.all(['admin', 'coach', 'member', 'badminton_fo'].map((role, i) => db.user.create({ data: { name: ['Attendance Admin', 'Coach May', 'Aye Student', 'Front Desk'][i], email: `qa${i}@attendance.test`, role: role as any } })));
  const coach = await db.coach.create({ data: { userId: users[1].id, name: users[1].name, specialty: 'Badminton', phone: '', email: users[1].email } });
  await db.booking.create({ data: { code: 'ATTENDANCE-QA', userId: users[2].id, coachId: coach.id, kind: 'private_course', title: 'Footwork foundations', date: today(), time: '10:00 — 11:00', location: 'Court 1', price: 10000, paymentStatus: 'paid', status: 'CONFIRMED' } });
  await db.badmintonEnrollment.create({ data: { userId: users[2].id, studentId: users[2].id, studentName: users[2].name, phone: '', packageId: 'fixture', packageName: 'Ten court visits', sessionsTotal: 10, sessionsRemaining: 10, startDate: today(), expiryDate: '2099-01-01' } });
  const tokens = await Promise.all(users.map(async user => ({ role: user.role, token: (await createSessionService(db).issue(db, user, 'database_password', [])).accessToken })));
  writeFileSync(process.env.ATTENDANCE_QA_FIXTURE_PATH, JSON.stringify({ tokens, date: today() }));
} finally { await db.$disconnect(); }
