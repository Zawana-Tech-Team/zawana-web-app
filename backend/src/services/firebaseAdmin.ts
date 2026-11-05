import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken, type UserRecord } from 'firebase-admin/auth';
import { createHash, createPrivateKey } from 'node:crypto';
import { FirebaseHttpAgent, firebaseRead } from './firebaseReliability.js';
import { requestContext } from '../utils/requestContext.js';
let firebaseApp: App | null = null;
const agent = new FirebaseHttpAgent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 8 });
const verificationFlights = new Map<string, Promise<DecodedIdToken>>();
function configurationError(configurationReason = 'initialization_failed') {
  return Object.assign(new Error('Authentication configuration requires administrator attention.'), { statusCode: 503, code: 'AUTH_CONFIGURATION', retryable: false, configurationReason });
}
export function firebaseConfiguration(environment: NodeJS.ProcessEnv = process.env) {
  const projectId = (environment.FIREBASE_PROJECT_ID || environment.GOOGLE_CLOUD_PROJECT || '').trim();
  if (!projectId || !/^[a-z0-9][a-z0-9-]{3,62}$/.test(projectId)) throw configurationError('missing_project');
  if (environment.NODE_ENV === 'production' && environment.FIREBASE_AUTH_EMULATOR_HOST) throw configurationError('production_emulator');
  const privateKey = environment.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim(), clientEmail = environment.FIREBASE_CLIENT_EMAIL?.trim();
  if (!!privateKey !== !!clientEmail) throw configurationError('partial_service_account');
  if (privateKey && clientEmail) {
    if (!/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(clientEmail)) throw configurationError('invalid_service_email');
    try { if (createPrivateKey(privateKey).asymmetricKeyType !== 'rsa') throw configurationError('invalid_private_key'); } catch { throw configurationError('invalid_private_key'); }
  }
  return { projectId, privateKey, clientEmail, credentialMode: privateKey ? 'service_account' : 'application_default' };
}
function configuredApp() {
  if (firebaseApp) return firebaseApp;
  const config = firebaseConfiguration();
  try {
    const existing = getApps().find(app => app.name === 'zawana-auth');
    if (existing && existing.options.projectId !== config.projectId) throw configurationError('project_mismatch');
    firebaseApp = existing || initializeApp({ projectId: config.projectId, httpAgent: agent,
      credential: config.privateKey && config.clientEmail ? cert({ projectId: config.projectId, privateKey: config.privateKey, clientEmail: config.clientEmail }, agent) : applicationDefault(agent) }, 'zawana-auth');
    return firebaseApp;
  } catch (error) { if ((error as { code?: string }).code === 'AUTH_CONFIGURATION') throw error; throw configurationError(); }
}
export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  if (typeof token !== 'string' || token.length > 16384) throw Object.assign(new Error('Invalid Firebase ID token.'), { statusCode: 401, code: 'INVALID_PROOF', retryable: false });
  const key = createHash('sha256').update(token).digest('hex');
  const existing = verificationFlights.get(key);
  if (existing) return existing;
  const flight = firebaseRead('verify_id_token', () => getAuth(configuredApp()).verifyIdToken(token, true));
  // Coalesce only in-flight checks. Never cache successful authorization across requests.
  if (verificationFlights.size < 256) verificationFlights.set(key, flight);
  try { return await flight; } finally { if (verificationFlights.get(key) === flight) verificationFlights.delete(key); }
}
export function getFirebaseIdentity(uid: string): Promise<UserRecord> {
  const context = requestContext.getStore();
  const existing = context?.memoizeIdentity ? context.identityReads.get(uid) : undefined;
  if (existing) return existing as Promise<UserRecord>;
  const flight = firebaseRead('get_identity', () => firebaseAdminAuth().getUser(uid));
  if (context?.memoizeIdentity) context.identityReads.set(uid, flight);
  return flight;
}
export function firebaseAdminAuth() { return getAuth(configuredApp()); }

export function withFirebaseIdentitySnapshot<T>(action: () => Promise<T>): Promise<T> {
  const current = requestContext.getStore();
  return requestContext.run({ requestId: current?.requestId || 'internal', firebaseDeadline: current?.firebaseDeadline ?? Date.now() + 20000, memoizeIdentity: true, identityReads: new Map() }, action);
}
