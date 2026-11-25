import { spawnSync } from 'node:child_process';

// Reuse the admin acceptance journeys with an actual FO session and FO routes.
// Each journey creates an isolated database; configured app data is never used.
for (const name of [
  'test-admin-court-selection-browser',
  'test-admin-rental-reschedule-browser',
  'test-rental-move-availability-browser',
  'test-admin-refund-ui-browser',
  'test-admin-request-tabs-browser',
]) {
  console.log(`Badminton FO court rental parity: ${name}`);
  const result = spawnSync(process.execPath, [`scripts/${name}.mjs`], {
    stdio: 'inherit', env: { ...process.env, COURT_DESK_ROLE: 'badminton_fo' },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
