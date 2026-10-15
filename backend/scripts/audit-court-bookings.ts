import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { occupyingStatuses } from "../src/services/courtBooking.js";
import { range, overlaps } from "../src/services/courtPolicy.js";
// Read-only preflight. Never repair or discard booking history automatically.
try {
  const rows = await prisma.booking.findMany({
    where: { courtId: { not: null }, status: { in: occupyingStatuses } },
    select: { code: true, courtId: true, date: true, time: true },
  });
  const malformed = rows
    .filter((row) => !range(row.time))
    .map((row) => row.code);
  const conflicts: { first: string; second: string; date: string }[] = [];
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i],
        b = rows[j];
      if (
        a.courtId === b.courtId &&
        a.date === b.date &&
        overlaps(a.time, b.time)
      )
        conflicts.push({ first: a.code, second: b.code, date: a.date });
    }
  console.log(
    JSON.stringify(
      { activeCourtReservations: rows.length, malformed, conflicts },
      null,
      2,
    ),
  );
  if (malformed.length || conflicts.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
