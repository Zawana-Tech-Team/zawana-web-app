import 'dotenv/config';
import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { firebaseAdminAuth, firebaseConfiguration } from '../src/services/firebaseAdmin.js';
import { classifyFirebaseError, firebaseAttempt } from '../src/services/firebaseReliability.js';

// Run inside each API instance. Never print credentials, provider payloads, users or ID tokens.
async function main() {
  const config = firebaseConfiguration();
  console.log(JSON.stringify({ check: 'configuration', ok: true, projectId: config.projectId, credentialMode: config.credentialMode, node: process.version, timeUtc: new Date().toISOString(), proxyConfigured: !!process.env.TRUSTED_PROXY_CIDRS }));
  for (const url of [
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
    'https://oauth2.googleapis.com/token', 'https://identitytoolkit.googleapis.com/',
  ]) {
    const host = new URL(url).hostname, started = Date.now();
    try {
      // Bound DNS as well as HTTPS; do not allow an unhealthy resolver to hang the run.
      let dnsTimer: ReturnType<typeof setTimeout> | undefined;
      const addresses = await Promise.race([lookup(host, { all: true }), new Promise<never>((_resolve, reject) => {
        dnsTimer = setTimeout(() => reject(Object.assign(new Error('DNS deadline exceeded'), { code: 'EAUTHDEADLINE' })), 8000);
      })]).finally(() => { if (dnsTimer) clearTimeout(dnsTimer); });
      const result = await new Promise<{ status?: number; date?: string }>((resolve, reject) => {
        const req = get(url, { signal: AbortSignal.timeout(8000) }, response => {
          response.resume(); resolve({ status: response.statusCode, date: response.headers.date });
        }); req.once('error', reject);
      });
      const ended = Date.now();
      // GET on OAuth/Identity Toolkit roots can legitimately return 4xx. Certificates must return 200.
      const ok = host === 'www.googleapis.com' ? result.status === 200 : !!result.status && result.status < 500;
      if (!ok) process.exitCode = 1;
      console.log(JSON.stringify({ check: 'outbound_https', ok, host, status: result.status, elapsedMs: ended - started,
        ipv4: addresses.filter(a => a.family === 4).length, ipv6: addresses.filter(a => a.family === 6).length,
        // Certificate responses are cached; use only uncached identity endpoint dates for clock checks.
        clockSkewMs: host === 'identitytoolkit.googleapis.com' && result.date ? Math.round(Date.parse(result.date) - (started + ended) / 2) : undefined }));
    } catch (error) { console.log(JSON.stringify({ check: 'outbound_https', ok: false, host, elapsedMs: Date.now() - started, ...classifyFirebaseError(error) })); process.exitCode = 1; }
  }
  const state = { deadline: Date.now() + 15000, signals: new Map() };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await firebaseAttempt.run(state, () => Promise.race([
      firebaseAdminAuth().app.options.credential!.getAccessToken(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Credential check timed out'), { code: 'EAUTHDEADLINE' })), 15000); }),
    ]));
    console.log(JSON.stringify({ check: 'service_credential', ok: true }));
  } catch (error) { console.log(JSON.stringify({ check: 'service_credential', ok: false, ...classifyFirebaseError(error, [...state.signals.values()]) })); process.exitCode = 1; }
  finally { if (timer) clearTimeout(timer); }
}
void main().catch(error => { console.error(JSON.stringify({ check: 'configuration', ok: false, ...classifyFirebaseError(error) })); process.exitCode = 1; });
