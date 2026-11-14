import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';

// Optional QA tooling, kept outside application/production dependencies.
const tools = process.env.MANUAL_PG_TOOLS || join(tmpdir(), 'zawana-manual-pg-tools');
const require = createRequire(join(tools, 'package.json'));
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const temp = mkdtempSync(join(tmpdir(), 'zawana-manual-pg-qa-'));
const root = fileURLToPath(new URL('../backend/', import.meta.url));
const net = createServer(); await new Promise(resolve => net.listen(0, '127.0.0.1', resolve));
const port = net.address().port; await new Promise(resolve => net.close(resolve));
const password = randomUUID(), name = `manual_qa_${randomUUID().replaceAll('-', '')}`;
const pg = new EmbeddedPostgres({ databaseDir: join(temp, 'data'), port, user: 'postgres', password, persistent: true, autoRehydrateSymlinks: true, postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: () => {} });
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase(name);
  const schema = readFileSync(join(root, 'prisma/postgresql/schema.prisma'), 'utf8').replace(/binaryTargets\s*=\s*\[[^\]]+\]/, 'binaryTargets = ["native"]').replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n  output = "${join(temp, 'pg-client').replaceAll('\\', '/')}"`);
  const schemaPath = join(temp, 'schema.prisma'); writeFileSync(schemaPath, schema);
  const env = { ...process.env, AUTH_MODE: "firebase", DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${name}`, DIRECT_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${name}`, MANUAL_QA_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${name}` };
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'generate', '--schema', schemaPath], { cwd: root, env, stdio: 'pipe', timeout: 45000 });
  const loader = join(temp, 'pg-loader.mjs');
  writeFileSync(loader, `import { registerHooks } from 'node:module';\nregisterHooks({ resolve(specifier, context, next) { if (specifier === '@prisma/client') return { url: ${JSON.stringify(pathToFileURL(join(temp, 'pg-client/index.js')).href)}, shortCircuit: true }; return next(specifier, context); } });`);
  env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --import=${pathToFileURL(loader).href}`;
  const status = await new Promise(resolve => { const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-isolation=none', 'tests/manual-payments.integration.test.ts'], { cwd: root, env, stdio: 'inherit' }); child.on('exit', resolve); });
  if (status !== 0) process.exitCode = 1;
} finally { await pg.stop(); }
