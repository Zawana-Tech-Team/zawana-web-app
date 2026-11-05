import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:https';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { classifyFirebaseError, firebaseRead, FirebaseHttpAgent } from '../src/services/firebaseReliability.js';
import { firebaseConfiguration } from '../src/services/firebaseAdmin.js';
import { requestContext } from '../src/utils/requestContext.js';
import { apiFailureDiagnostic } from '../src/utils/apiDiagnostics.js';
import { createFirebaseSessionExchange } from '../../src/services/firebaseSession.js';

const secret = 'DO-NOT-LOG-TOKEN-PRIVATE-KEY-EMAIL';
test('Firebase errors distinguish invalid proofs, bad configuration and confirmed infrastructure failures', () => {
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/invalid-id-token']) {
    const result = classifyFirebaseError({ code, message: secret }, [{ endpoint: 'identity', upstreamStatus: 503 }]);
    assert.equal(result.transient, false); assert.equal(result.category, 'invalid_proof');
  }
  assert.equal(classifyFirebaseError({ code: 'auth/argument-error', message: secret }).category, 'invalid_proof');
  assert.equal(classifyFirebaseError({ code: 'auth/argument-error' }, [{ endpoint: 'certificates', upstreamStatus: 500 }]).transient, true);
  assert.equal(classifyFirebaseError({ code: 'auth/invalid-credential' }).category, 'configuration');
  assert.equal(classifyFirebaseError({ code: 'auth/invalid-credential', cause: { code: 'EAI_AGAIN' } }).transient, true);
  assert.equal(classifyFirebaseError({ code: 'ENOTFOUND' }).transient, false);
  assert.equal(classifyFirebaseError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }).category, 'configuration');
  assert.equal(classifyFirebaseError({ code: 'auth/internal-error', message: '500 ' + secret }).transient, false, 'An arbitrary message is not proof of infrastructure failure');
});

test('bounded retry with jitter, safe correlation logs, deadline and permanent failure behavior', async () => {
  const logs: Record<string, unknown>[] = [], delays: number[] = [];
  let calls = 0;
  const value = await requestContext.run({ requestId: 'test-correlation', identityReads: new Map() }, () => firebaseRead('verify_id_token', async () => {
    if (++calls === 1) throw Object.assign(new Error(secret), { code: 'ECONNRESET' });
    return 'verified';
  }, { log: row => logs.push(row), sleep: async ms => { delays.push(ms); }, random: () => .5 }));
  assert.equal(value, 'verified'); assert.equal(calls, 2); assert.deepEqual(delays, [312]);
  assert.equal(logs[0].requestId, 'test-correlation'); assert.equal(JSON.stringify(logs).includes(secret), false);
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-credential', 'auth/argument-error']) {
    let attempts = 0;
    await assert.rejects(firebaseRead('verify_id_token', async () => { attempts++; throw Object.assign(new Error(secret), { code }); }, { log: row => logs.push(row) }));
    assert.equal(attempts, 1);
  }
  let attempts = 0;
  await assert.rejects(firebaseRead('get_identity', async () => { attempts++; throw Object.assign(new Error(secret), { code: 'EAI_AGAIN' }); }, { sleep: async () => {}, log: row => logs.push(row) }), (error: any) => {
    assert.equal(error.code, 'AUTH_UNAVAILABLE'); assert.equal(error.retryable, true);
    const diagnostic = apiFailureDiagnostic(error, { requestId: 'safe-id', method: 'POST', route: '/api/auth/session' });
    assert.equal(JSON.stringify(diagnostic).includes(secret), false); return true;
  });
  assert.equal(attempts, 2);
  await assert.rejects(firebaseRead('verify_id_token', () => new Promise(() => {}), { budgetMs: 15, log: row => logs.push(row) }), (error: any) => error.code === 'AUTH_UNAVAILABLE');
});

test('Firebase configuration validates partial credentials, project, RSA key and production emulator', () => {
  assert.throws(() => firebaseConfiguration({}), (e: any) => e.code === 'AUTH_CONFIGURATION');
  assert.throws(() => firebaseConfiguration({ FIREBASE_PROJECT_ID: 'auth-test', FIREBASE_CLIENT_EMAIL: 'x@auth-test.iam.gserviceaccount.com' }));
  assert.throws(() => firebaseConfiguration({ FIREBASE_PROJECT_ID: 'auth-test', FIREBASE_CLIENT_EMAIL: 'x@auth-test.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: secret }));
  assert.throws(() => firebaseConfiguration({ FIREBASE_PROJECT_ID: 'auth-test', NODE_ENV: 'production', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' }));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  assert.equal(firebaseConfiguration({ FIREBASE_PROJECT_ID: 'auth-test', FIREBASE_CLIENT_EMAIL: 'x@auth-test.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: privateKey.replaceAll('\n', '\\n') }).credentialMode, 'service_account');
});

test('real Firebase Admin SDK recovers certificate HTTP failure and still verifies signature, audience, expiry and revocation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zawana-firebase-sdk-')), keyPath = join(dir, 'key.pem'), certPath = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
  const key = readFileSync(keyPath), certificate = readFileSync(certPath);
  let failures = 1, certificateCalls = 0, identityCalls = 0, identityFailures = 0, revoked = false;
  const server = createServer({ key, cert: certificate }, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.includes('/robot/v1/metadata/x509/')) {
      certificateCalls++;
      if (failures-- > 0) { res.writeHead(500); res.end(JSON.stringify({ error: secret })); return; }
      res.setHeader('Cache-Control', 'public, max-age=3600'); res.end(JSON.stringify({ 'test-key': certificate.toString() })); return;
    }
    identityCalls++;
    if (identityFailures-- > 0) { res.writeHead(500); res.end(JSON.stringify({ error: { code: 500, message: 'INTERNAL_ERROR' } })); return; }
    res.end(JSON.stringify({ users: [{ localId: 'test-user', emailVerified: true, disabled: false, validSince: revoked ? String(Math.floor(Date.now() / 1000) + 60) : '0', providerUserInfo: [{ providerId: 'google.com', rawId: 'test-user' }] }] }));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  class TestAgent extends FirebaseHttpAgent {
    createConnection(options: any, callback: any) { return super.createConnection({ ...options, host: '127.0.0.1', hostname: '127.0.0.1', port, servername: 'localhost', ca: certificate }, callback); }
  }
  const agent = new TestAgent({ keepAlive: true });
  const app = initializeApp({ projectId: 'auth-test', httpAgent: agent, credential: { getAccessToken: async () => ({ access_token: 'test-only-credential', expires_in: 3600 }) } }, 'reliability-test');
  const logs: Record<string, unknown>[] = [];
  const token = (extra = {}) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ aud: 'auth-test', iss: 'https://securetoken.google.com/auth-test', sub: 'test-user', iat: Math.floor(Date.now() / 1000) - 10, auth_time: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: 'google.com' }, ...extra })).toString('base64url');
    return `${header}.${claims}.${sign('RSA-SHA256', `${header}.${claims}`, key).toString('base64url')}`;
  };
  const verify = (value: string) => firebaseRead('verify_id_token', () => getAuth(app).verifyIdToken(value, true), { sleep: async () => {}, log: row => logs.push(row) });
  try {
    assert.equal((await verify(token())).uid, 'test-user'); assert.equal(certificateCalls, 2); assert.equal(identityCalls, 1);
    assert.equal(logs[0].category, 'transient_infrastructure'); assert.equal(logs[0].upstreamStatus, 500);
    identityFailures = 1; assert.equal((await verify(token())).uid, 'test-user');
    assert.ok(logs.some(row => row.endpoint === 'identity' && row.upstreamStatus === 500));
    const tampered = token().split('.'); tampered[2] = (tampered[2].startsWith('A') ? 'B' : 'A') + tampered[2].slice(1);
    await assert.rejects(verify(tampered.join('.')), (error: any) => error.code === 'INVALID_PROOF');
    await assert.rejects(verify(token({ aud: 'wrong-project' })), (error: any) => error.code === 'INVALID_PROOF');
    await assert.rejects(verify(token({ iss: 'https://securetoken.google.com/wrong-project' })), (error: any) => error.code === 'INVALID_PROOF');
    await assert.rejects(verify(token({ exp: 1 })), (error: any) => error.code === 'INVALID_PROOF');
    revoked = true; await assert.rejects(verify(token()), (error: any) => error.code === 'INVALID_PROOF');
    assert.equal(JSON.stringify(logs).includes(secret), false);
  } finally { await deleteApp(app); agent.destroy(); await new Promise<void>(r => server.close(() => r())); rmSync(dir, { recursive: true, force: true }); }
});

test('frontend session exchange forces fresh tokens, coalesces concurrent requests and retries without another popup', async () => {
  let calls = 0, tokenCalls = 0, uid: string | undefined = 'google-a', release!: () => void;
  const identity = { uid: 'google-a', getIdToken: async (fresh: boolean) => { assert.equal(fresh, true); tokenCalls++; return 'fresh-google-token'; } };
  const gate = new Promise<void>(resolve => { release = resolve; });
  const coordinator = createFirebaseSessionExchange(async () => { calls++; await gate; return { user: { id: 'member-a' } } as any; }, () => uid);
  const first = coordinator.exchange(identity), second = coordinator.exchange(identity);
  assert.equal(first, second); release(); await first; assert.equal(calls, 1); assert.equal(tokenCalls, 1);
  let failures = 1;
  const retry = createFirebaseSessionExchange(async () => { if (failures-- > 0) throw Object.assign(new Error('Temporary outage'), { code: 'AUTH_UNAVAILABLE' }); return {} as any; }, () => uid);
  await assert.rejects(retry.exchange(identity)); await retry.exchange(identity);
  const timed = createFirebaseSessionExchange(() => new Promise(() => {}), () => uid, 10);
  await assert.rejects(timed.exchange(identity), (error: any) => error.code === 'SESSION_EXCHANGE_INTERRUPTED');
  const stale = createFirebaseSessionExchange(async () => { await gate; return {} as any; }, () => uid);
  const pending = stale.exchange(identity); uid = 'google-b';
  await assert.rejects(pending, (error: any) => error.code === 'SESSION_EXCHANGE_SUPERSEDED');
});
