import { PrismaClient } from '@prisma/client';
import { repairTodayWeeklyRemovals } from '../src/services/weeklyRemoval.js';
const db = new PrismaClient();
try {
  const result = await repairTodayWeeklyRemovals(db);
  console.log(JSON.stringify({date:result.date,correctedClasses:result.removedIds.length}));
} finally { await db.$disconnect(); }
