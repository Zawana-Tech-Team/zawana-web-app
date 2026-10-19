import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createSessionService } from '../src/services/authSession.js';
import { today } from '../src/services/courtPolicy.js';

if (!process.env.DATABASE_URL?.includes('zawana-content-browser-') || !process.env.CONTENT_QA_FIXTURE_PATH)
  throw new Error('Content browser fixtures require an isolated temporary database.');
const db = new PrismaClient();
try {
  const admin = await db.user.create({ data: { name: 'QA Content Admin', email: 'admin@content.test', role: 'admin' } });
  const member = await db.user.create({ data: { name: 'QA Reader', email: 'reader@content.test', role: 'member' } });
  const sessions = createSessionService(db);
  const tokens = {
    admin: (await sessions.issue(db, admin, 'database_password', [])).accessToken,
    member: (await sessions.issue(db, member, 'database_password', [])).accessToken
  };
  const coachFixtures = [
    { name: 'Aye Badminton', department: 'Badminton', status: 'active', active: true },
    { name: 'Gym Only', department: 'Gym', status: 'active', active: true },
    { name: 'Inactive Profile', department: 'Badminton', status: 'inactive', active: true },
    { name: 'Inactive Account', department: 'Badminton', status: 'active', active: false }
  ] as const;
  for (const [index, fixture] of coachFixtures.entries()) {
    const user = await db.user.create({ data: { name: fixture.name, email: `coach${index}@content.test`, role: 'coach', active: fixture.active } });
    await db.coach.create({ data: { name: fixture.name, email: user.email, userId: user.id, department: fixture.department, status: fixture.status, phone: 'private-number', specialty: 'Footwork & match strategy' } });
  }
  const article = { kind: 'achievement', category: 'Tournaments', title: 'A weekend to remember', description: 'Celebrating our badminton community and the dedication behind every rally.', body: 'A milestone for the ZAWANA community.\n\nEvery rally started with practice, patience, and a shared love of badminton.', image: '/facilities/court.webp', googleFormLink: '', publishDate: today() };
  const live = await db.contentItem.create({ data: { ...article, status: 'published' } });
  const draft = await db.contentItem.create({ data: { ...article, title: 'Draft secret', status: 'draft' } });
  const scheduled = await db.contentItem.create({ data: { ...article, title: 'Future secret', publishDate: '2999-01-01', status: 'published' } });
  const community = await db.contentItem.create({ data: { ...article, kind: 'community', title: 'Community event', status: 'published' } });
  writeFileSync(process.env.CONTENT_QA_FIXTURE_PATH, JSON.stringify({ tokens, live, draft, scheduled, community }));
} finally { await db.$disconnect(); }
