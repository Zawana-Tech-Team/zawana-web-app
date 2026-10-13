import 'dotenv/config';
import { getApp } from 'firebase-admin/app';
import { firebaseAdminAuth } from '../src/services/firebaseAdmin.js';

// Read configuration only. Private provider secrets and test phone numbers are never printed.
async function main() {
  firebaseAdminAuth();
  const app = getApp('zawana-auth');
  const project = process.env.FIREBASE_PROJECT_ID;
  if (!project || !/^[a-z0-9-]+$/.test(project))
    throw new Error('Invalid Firebase project configuration.');
  const access = await app.options.credential!.getAccessToken();
  const base = 'https://identitytoolkit.googleapis.com/admin/v2/projects/' + project;
  const checks = [
    'config',
    'defaultSupportedIdpConfigs/google.com',
    'defaultSupportedIdpConfigs/apple.com'
  ];
  for (const target of checks) {
    const response = await fetch(base + '/' + target, {
      headers: { Authorization: 'Bearer ' + access.access_token },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      console.log(JSON.stringify({ target, status: response.status }));
      continue;
    }
    const data =await response.json() as {
      enabled?: boolean;
      clientId?: string;
      signIn?: { phoneNumber?: { enabled?: boolean }; email?: { enabled?: boolean } };
      authorizedDomains?: string[];
      smsRegionConfig?: {
        allowByDefault?: { disallowedRegions?: string[] };
        allowlistOnly?: { allowedRegions?: string[] }
      };
    };
    console.log(
      JSON.stringify(
        target === 'config'
          ? {
              target,
              phoneEnabled: data.signIn?.phoneNumber?.enabled ?? false,
              emailEnabled: data.signIn?.email?.enabled ?? false,
              localhostAuthorized: data.authorizedDomains?.includes('localhost') ?? false,
              smsRegionPolicy: data.smsRegionConfig ?? null,
            }
          : { target, enabled: data.enabled ?? false, clientIdPresent: Boolean(data.clientId) }
      )
    );
  }
}

void main().catch(() => {
  console.error(
    'Firebase configuration check failed. Check the backend credential permissions and connectivity to oauth2.googleapis.com. No credentials were printed.'
  );
  process.exitCode = 1;
});
