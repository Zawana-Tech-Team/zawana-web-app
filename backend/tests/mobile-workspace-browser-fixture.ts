/** Test-only fixture. Requires a new temporary SQLite DB; never runs against a deployed database. */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createStaffCourse } from '../src/services/privateCourseFinance.js';
import { seedGymCatalog } from '../src/services/gymPackages.js';
import { today } from '../src/services/courtPolicy.js';

if (process.env.NODE_ENV === 'production' || !process.env.MOBILE_QA_MANIFEST) throw new Error('Local QA manifest path required.');
const dir = mkdtempSync(join(tmpdir(), 'zawana-mobile-workspace-'));
const file = join(dir, 'qa.db');
const sqlite = new DatabaseSync(file);
const migrations = new URL('../prisma/migrations/', import.meta.url);
for (const name of readdirSync(migrations).filter(n => /^\d/.test(n)).sort()) sqlite.exec(readFileSync(new URL(`${name}/migration.sql`, migrations), 'utf8'));
sqlite.close();
const db = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
const password = 'Mobile-QA-Password1!';
try {
  const users = await Promise.all((['member', 'coach', 'admin', 'badminton_fo'] as const).map(async role => db.user.create({ data: { name: `QA ${role}`, email: `${role}@mobile.test`, role, passwordHash: await bcrypt.hash(password, 10) } })));
  const [member, coachUser, admin, fo] = users;
  const coach = await db.coach.create({ data: { userId: coachUser.id, name: 'QA Coach', department: 'Badminton', specialty: 'Footwork & technique', email: coachUser.email, phone: '', status: 'active' } });
  const courts = await Promise.all(Array.from({ length: 8 }, (_, i) => db.court.create({ data: { name: `Court ${i + 1}`, price: 20000, type: 'Standard', surface: i < 4 ? '2nd Floor' : '6th Floor', features: [] } })));
  const course = await db.privateCourse.create({ data: { title: 'Individual footwork', description: 'Personal badminton coaching.', duration: 60, price: 50000, status: 'active', coaches: { connect: { id: coach.id } } } });
  const tomorrowDate = new Date(`${today()}T12:00:00Z`); tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  const pending = await createStaffCourse(db, fo, { memberId: member.id, courseId: course.id, coachId: coach.id, courtId: courts[0].id, date: tomorrow, time: '8:00 AM — 9:00 AM', expectedPrice: 50000, paymentSource: 'UNPAID', requestKey: randomUUID() });
  await createStaffCourse(db, admin, { memberId: member.id, courseId: course.id, coachId: coach.id, courtId: courts[1].id, date: tomorrow, time: '10:00 AM — 11:00 AM', expectedPrice: 50000, paymentSource: 'BADMINTON_FO', requestKey: randomUUID() });
  const attendance = await db.booking.create({ data: { userId: member.id, coachId: coach.id, courtId: courts[2].id, kind: 'private_course', code: 'QA-TODAY', title: course.title, date: today(), time: '6:00 AM — 7:00 AM', location: 'Court 3', status: 'CONFIRMED', price: 50000, paymentStatus: 'paid' } });
  const enrollments = [];
  for (const categoryCode of ['FOUNDATION', 'SOCIAL'] as const) {
    const category = await db.badmintonPackageCategory.findUniqueOrThrow({ where: { code: categoryCode } });
    const pkg = await db.badmintonPackage.create({ data: { title: `${categoryCode} ten visits`, price: 100000, sessions: 10, validity: 30, description: 'QA package', categoryId: category.id } });
    enrollments.push(await db.badmintonEnrollment.create({ data: { userId: member.id, studentId: member.id, studentName: member.name, phone: '', packageId: pkg.id, packageName: pkg.title, categoryCode, sessionsTotal: 10, sessionsRemaining: 10, startDate: today(), expiryDate: categoryCode === 'FOUNDATION' ? '2098-01-01' : '2099-01-01' } }));
  }

  const gymUser = await db.user.create({ data: { name: 'QA Gym Coach', email: 'gymcoach@mobile.test', role: 'coach', passwordHash: await bcrypt.hash(password,10) } });
  const gymCoach = await db.coach.create({ data: { userId: gymUser.id, name: 'QA Gym Coach', department: 'Gym', specialty: 'Strength', email: gymUser.email, phone: '', status: 'active' } });
  await seedGymCatalog(db);
  const gymPackage = await db.gymPackage.findUniqueOrThrow({ where: { id: 'gym-initial-pt-10' } });
  const yesterdayDate = new Date(`${today()}T12:00:00Z`); yesterdayDate.setUTCDate(yesterdayDate.getUTCDate()-1); const yesterday = yesterdayDate.toISOString().slice(0,10);
  const gymEnrollment = await db.gymEnrollment.create({ data: { code: 'QA-PT-ENROLLMENT', packageId: gymPackage.id, packageVersion: gymPackage.version, snapshot: JSON.parse(JSON.stringify(gymPackage)), kind:'PT',totalPrice:gymPackage.price,sessionsTotal:10,sessionsRemaining:10,status:'ACTIVE',paidAt:new Date(),startDate:yesterday,expiryDate:'2099-01-01',coachId:gymCoach.id,createdById:admin.id,requestKey:randomUUID(),payloadHash:'isolated-fixture',members:{create:{userId:member.id}} } });
  const gymSessions=[];
  for (const [date,startTime,endTime] of [[today(),'10:00','11:00'],[yesterday,'10:00','11:00'],[yesterday,'12:00','13:00'],[today(),'14:00','15:00']]) gymSessions.push(await db.privateTrainingSession.create({data:{memberId:member.id,coachId:gymCoach.id,enrollmentId:gymEnrollment.id,date,startTime,endTime,durationMinutes:60,createdById:admin.id,attendance:{create:{userId:member.id}}}}));
  const extraAttendance=await db.booking.create({ data:{userId:member.id,coachId:coach.id,courtId:courts[3].id,kind:'private_course',code:'QA-NOTES',title:course.title,date:today(),time:'9:00 AM — 10:00 AM',location:'Court 4',status:'CONFIRMED',price:50000,paymentStatus:'paid'} });
  const completeCourse=await db.booking.create({ data:{userId:member.id,coachId:coach.id,courtId:courts[0].id,kind:'private_course',code:'QA-PRIVATE-COMPLETE',title:course.title,date:yesterday,time:'8:00 AM — 9:00 AM',location:'Court 1',status:'CONFIRMED',price:50000,paymentStatus:'paid'} });
  const notice=await db.notification.create({data:{userId:coachUser.id,title:'Coach workspace ready',body:'Your assigned sessions are available.',type:'info'}});
  writeFileSync(process.env.MOBILE_QA_MANIFEST!, JSON.stringify({ databaseUrl: `file:${file}`, password, noticeId:notice.id, completeCourseId:completeCourse.id, extraAttendanceId:extraAttendance.id, gym:{email:gymUser.email,userId:gymUser.id,enrollmentId:gymEnrollment.id,todayId:gymSessions[0].id,completeId:gymSessions[1].id,noShowId:gymSessions[2].id,cancelId:gymSessions[3].id}, users: users.map(u => ({ id: u.id, email: u.email, role: u.role })), pendingId: pending.id, attendanceId: attendance.id, enrollments: enrollments.map(e => ({ id: e.id, categoryCode: e.categoryCode })), today: today(), tomorrow, courseId: course.id, courts: courts.map(c => c.id) }));
  console.log('Temporary mobile QA database ready.');
} finally { await db.$disconnect(); }
