import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { today } from '../src/services/courtPolicy.js';
if (!process.env.DATABASE_URL?.includes('zawana-admin-browser-') || !process.env.ADMIN_QA_FIXTURE_PATH)
  throw new Error('Court fixtures require an isolated temporary database.');
const db = new PrismaClient();
try {
  const member = await db.user.create({ data: { name: 'Court QA Member', email: 'member@court.test', role: 'admin' } });
  const courts = [];
  for (let i = 1; i <= 8; i++) courts.push(await db.court.create({ data: { name: `Court ${i}`, price: 20000, type: 'Standard', surface: 'Indoor', features: [], status: 'available' } }));
  const dates = [1, 2].map(offset => { const date = new Date(`${today()}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10) });
  for (const department of ['Badminton', 'Gym']) {
    const user = await db.user.create({ data: { name: `QA ${department} Coach`, email: `${department.toLowerCase()}@coach.test`, role: 'coach' } });
    await db.coach.create({ data: { name: user.name, email: user.email, phone: '', specialty: department, department, userId: user.id } });
  }
  await db.badmintonPackage.create({ data: { title: 'Weekend Sessions', price: 120000, sessions: 10, validity: 60, description: 'A flexible session package.', status: 'active' } });
  const token = (await createSessionService(db).issue(db, member, 'database_password', [])).accessToken;
  writeFileSync(process.env.ADMIN_QA_FIXTURE_PATH, JSON.stringify({ token, dates, courts }));
} finally { await db.$disconnect(); }
