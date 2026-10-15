import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { seedGymCatalog } from '../src/services/gymPackages.js';
import { createGymEnrollment } from '../src/services/gymEnrollments.js';
import { today } from '../src/services/gymPolicy.js';
import { randomUUID } from 'node:crypto';

if (!process.env.DATABASE_URL?.includes('zawana-gym-browser-') || !process.env.GYM_QA_FIXTURE_PATH)
  throw new Error('Browser fixtures require an isolated temporary gym QA database.');
const db = new PrismaClient();
try {
  await seedGymCatalog(db);
  const admin = await db.user.create({ data: { name: 'QA Gym Admin', email: 'admin@gym-browser.test', role: 'admin' } });
  const desk = await db.user.create({ data: { name: 'QA Gym Desk', email: 'desk@gym-browser.test', role: 'gym_fo' } });
  const coachUser = await db.user.create({ data: { name: 'QA Gym Coach', email: 'coach@gym-browser.test', role: 'coach' } });
  const coach = await db.coach.create({ data: { name: coachUser.name, email: coachUser.email, userId: coachUser.id, department: 'Gym', specialty: 'Personal training', phone: '' } });
  const a = await db.user.create({ data: { name: 'QA Member Alpha', email: 'alpha@gym-browser.test', phone: '+959000001', role: 'member' } });
  const b = await db.user.create({ data: { name: 'QA Member Beta', email: 'beta@gym-browser.test', phone: '+959000002', role: 'member' } });
  const pending = await createGymEnrollment(db, desk.id, {
    packageId: 'gym-initial-pt-1', packageVersion: 1, memberIds: [a.id],
    coachId: coach.id, startDate: today(), requestKey: randomUUID(),
  });
  const service = createSessionService(db);
  const tokens = {} as Record<string, string>;
  for (const [role, user] of [['admin', admin], ['desk', desk], ['coach', coachUser], ['member', a]] as const)
    tokens[role] = (await service.issue(db, user, 'database_password', [])).accessToken;
  writeFileSync(process.env.GYM_QA_FIXTURE_PATH, JSON.stringify({ tokens, coach, members: [a.id, b.id], pending: { id: pending.id, code: pending.code } }));
} finally { await db.$disconnect(); }
