import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
if (!process.env.DATABASE_URL?.includes('zawana-badminton-browser-') || !process.env.BADMINTON_QA_FIXTURE_PATH)
  throw new Error('Badminton fixtures require an isolated temporary database.');
const db = new PrismaClient();
try {
  const staff = await db.user.create({ data: { name: 'Badminton QA', email: 'fo@badminton.test', role: 'badminton_fo' } });
  const member = await db.user.create({ data: { name: 'Aye Package Member', email: 'aye@badminton.test', phone: '09123456789', role: 'member' } });
  await db.user.create({ data: { name: 'Other Member', email: 'other@badminton.test', role: 'member' } });
  const pkg = await db.badmintonPackage.create({ data: { title: 'QA Ten Sessions', price: 150000, sessions: 10, validity: 30, description: 'QA package', status: 'active' } });
  const token = (await createSessionService(db).issue(db, staff, 'database_password', [])).accessToken;
  writeFileSync(process.env.BADMINTON_QA_FIXTURE_PATH, JSON.stringify({ token, member, pkg }));
} finally { await db.$disconnect(); }
