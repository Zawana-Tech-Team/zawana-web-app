import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { createCourtBooking } from '../src/services/courtBooking.js';
import { today } from '../src/services/courtPolicy.js';
if (!process.env.DATABASE_URL?.includes('zawana-attendance-browser-') || !process.env.ATTENDANCE_QA_FIXTURE_PATH) throw new Error('Isolated attendance database required.');
const db = new PrismaClient();
try {
  const users = await Promise.all(['admin', 'coach', 'member', 'badminton_fo'].map((role, i) => db.user.create({ data: { name: ['Attendance Admin', 'Coach May', 'Aye Student', 'Front Desk'][i], email: `qa${i}@attendance.test`, role: role as any } })));
  const coach = await db.coach.create({ data: { userId: users[1].id, name: users[1].name, specialty: 'Badminton', phone: '', email: users[1].email } });
  await db.booking.create({ data: { code: 'ATTENDANCE-QA', userId: users[2].id, coachId: coach.id, kind: 'private_course', title: 'Footwork foundations', date: today(), time: '10:00 — 11:00', location: 'Court 1', price: 10000, paymentStatus: 'paid', status: 'CONFIRMED' } });
  const social = await db.badmintonPackageCategory.findUniqueOrThrow({ where: { code: 'SOCIAL' } });
  const pkg = await db.badmintonPackage.create({ data: { title: 'Ten court visits', sessions: 10, validity: 30, price: 100000, description: 'Social sessions', categoryId: social.id } });
  const foundation = await db.badmintonPackageCategory.findUniqueOrThrow({ where: { code: 'FOUNDATION' } });
  const foundationPkg = await db.badmintonPackage.create({ data: { title: 'Foundation twelve', sessions: 12, validity: 30, price: 100000, description: 'Foundation sessions', categoryId: foundation.id } });
  await db.badmintonEnrollment.create({ data: { userId: users[2].id, studentId: users[2].id, studentName: users[2].name, phone: '', packageId: foundationPkg.id, packageName: foundationPkg.title, categoryCode: 'FOUNDATION', sessionsTotal: 12, sessionsRemaining: 12, startDate: today(), expiryDate: '2098-01-01' } });
  await db.badmintonEnrollment.create({ data: { userId: users[2].id, studentId: users[2].id, studentName: users[2].name, phone: '', packageId: pkg.id, categoryCode: 'SOCIAL', packageName: 'Ten court visits', sessionsTotal: 10, sessionsRemaining: 10, startDate: today(), expiryDate: '2099-01-01' } });
  const legacyPkg = await db.badmintonPackage.create({ data: { title: 'Legacy review package', sessions: 10, validity: 30, price: 100000, description: 'Unclassified history for admin review' } });
  const legacy = await db.badmintonEnrollment.create({ data: { studentId: 'WALKIN-REVIEW', studentName: 'Legacy holder', phone: '', packageId: legacyPkg.id, packageName: legacyPkg.title, startDate: '2020-01-01', expiryDate: '2099-01-01', sessionsTotal: 10, sessionsRemaining: 7 } });
  await db.badmintonCheckIn.create({ data: { enrollmentId: legacy.id, date: '2020-01-02', time: '09:00', sessionsUsed: 1 } });
  const court = await db.court.create({ data: { name: '2F SOP Court', type: 'Standard', surface: 'Indoor', features: [], price: 20000 } });
  const day = new Date(`${today()}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 4);
  const targetDate = day.toISOString().slice(0, 10);
  const booking = (await createCourtBooking(db, users[2], { bookings: [{ courtId: court.id, date: targetDate, time: '8:00 AM — 9:00 AM' }] })).booking;
  await db.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'paid' } });
  const tokens = await Promise.all(users.map(async user => ({ role: user.role, token: (await createSessionService(db).issue(db, user, 'database_password', [])).accessToken })));
  writeFileSync(process.env.ATTENDANCE_QA_FIXTURE_PATH, JSON.stringify({ tokens, date: today(), targetDate, bookingId: booking.id }));
} finally { await db.$disconnect(); }
