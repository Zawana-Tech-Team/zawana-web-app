import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

let firebaseApp: App | null = null;

function configuredApp() {
  if (firebaseApp) return firebaseApp;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) return null;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const credential =
    privateKey && clientEmail ? cert({ projectId, privateKey, clientEmail }) : applicationDefault();
  firebaseApp =
    getApps().find((app) => app.name === 'zawana-auth') ||
    initializeApp({ credential, projectId }, 'zawana-auth');
  return firebaseApp;
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken> {
  const app = configuredApp();
  if (!app)
    throw Object.assign(new Error('Firebase Authentication is not configured on the server.'), {
      statusCode: 503, code: 'AUTH_UNAVAILABLE'
    });
  try {
    return await getAuth(app).verifyIdToken(token, true);
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
    if (
      [
        'auth/argument-error',
        'auth/invalid-id-token',
        'auth/id-token-expired',
        'auth/id-token-revoked',
        'auth/user-disabled',
        'auth/user-not-found'
      ].includes(String(code))
    ) {
      throw Object.assign(new Error('Invalid, expired, or revoked Firebase ID token.'), {
        statusCode: 401, code: 'INVALID_PROOF'
      });
    }
    throw Object.assign(new Error('Firebase identity verification is temporarily unavailable.'), {
      statusCode: 503, code: 'AUTH_UNAVAILABLE'
    });
  }
}

export function firebaseAdminAuth() {
  const app = configuredApp();
  if (!app)
    throw Object.assign(new Error('Firebase Authentication is not configured on the server.'), {
      statusCode: 503, code: 'AUTH_UNAVAILABLE'
    });
  return getAuth(app);
}
