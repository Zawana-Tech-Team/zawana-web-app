import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { getApp } from 'firebase-admin/app';
import { firebaseAdminAuth } from '../src/services/firebaseAdmin.js';

// Uses only the existing BACKEND credential. Never copy an Admin key into the mobile app.
const certificates = [
  { certType: 'SHA_1', shaHash: 'BC08D1EEA6148D209239122AB1D5ADD72153185D' },
  {
    certType: 'SHA_256',
    shaHash: '2C287BE0F71522A295F302C6A5F9E02B11D3D22B1C34D9931D1D5C97A189F424'
  },
];

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error('Supply the actual Android Firebase SDK configuration file path.');
  const contents = await readFile(filename, 'utf8');
  const config = JSON.parse(contents) as {
    project_info: { project_id: string };
    client: {
      client_info: { mobilesdk_app_id: string; android_client_info: { package_name: string } }
    }[];
  };
  const project = process.env.FIREBASE_PROJECT_ID;
  if (!project || project !== config.project_info.project_id || !/^[a-z0-9-]+$/.test(project))
    throw new Error('Project configuration mismatch.');
  const client = config.client.find(
    value => value.client_info.android_client_info.package_name === 'com.zawana.mobile'
  );
  if (!client) throw new Error('The registered ZAWANA Android app is missing.');
  firebaseAdminAuth();
  const token = await getApp('zawana-auth').options.credential!.getAccessToken();
  const headers = {
    Authorization: 'Bearer ' + token.access_token,
    'Content-Type': 'application/json'
  };
  for (const certificate of certificates) {
    const endpoint =
      'https://firebase.googleapis.com/v1beta1/projects/' +
      project +
      '/androidApps/' +
      encodeURIComponent(client.client_info.mobilesdk_app_id) +
      '/sha';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(certificate),
      signal: AbortSignal.timeout(15_000)
    });
    console.log(
      JSON.stringify({
        action: 'register-signing-certificate',
        certType: certificate.certType,
        status: response.status
      })
    );
    if (!response.ok && response.status !== 409)
      throw new Error('Certificate registration was denied.');
  }
  const endpoint =
    'https://identitytoolkit.googleapis.com/admin/v2/projects/' + project + '/config';
  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Cannot read SMS region policy.');
  const data =await response.json() as {
    smsRegionConfig?: {
      allowlistOnly?: { allowedRegions?: string[] };
      allowByDefault?: { disallowedRegions?: string[] }
    }
  };
  const policy = data.smsRegionConfig;
  // Preserve the current mode and all previously allowed regions. Change only MM as requested.
  const smsRegionConfig = policy?.allowByDefault
    ? {
        allowByDefault: {
          disallowedRegions: (policy.allowByDefault.disallowedRegions ?? []).filter(
            region => region !== 'MM'
          )
        }
      }
    : {
        allowlistOnly: {
          allowedRegions: [...new Set([...(policy?.allowlistOnly?.allowedRegions ?? []), 'MM'])]
        }
      };
  const update = await fetch(endpoint + '?updateMask=smsRegionConfig', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ smsRegionConfig }),
    signal: AbortSignal.timeout(15_000)
  });
  console.log(JSON.stringify({ action: 'enable-Myanmar-SMS-region', status: update.status }));
  if (!update.ok) throw new Error('SMS region update was denied.');
  const configEndpoint =
    'https://firebase.googleapis.com/v1beta1/projects/' +
    project +
    '/androidApps/' +
    encodeURIComponent(client.client_info.mobilesdk_app_id) +
    '/config';
  const sdkResponse = await fetch(configEndpoint, { headers, signal: AbortSignal.timeout(15_000) });
  if (!sdkResponse.ok) throw new Error('Cannot retrieve the updated native SDK configuration.');
  const sdk =await sdkResponse.json() as { configFileContents: string };
  const sdkContents = Buffer.from(sdk.configFileContents, 'base64').toString('utf8');
  const updated = JSON.parse(sdkContents) as {
    type?: string;
    project_info?: { project_id?: string };
    client?: { oauth_client?: { client_type?: number }[] }[]
  };
  if (updated.type === 'service_account' || updated.project_info?.project_id !== project)
    throw new Error('Unexpected SDK configuration.');
  await writeFile(filename, sdkContents);
  console.log(
    JSON.stringify({
      action: 'refresh-public-Android-SDK-config',
      oauthClientTypes: updated.client?.flatMap(
        value => value.oauth_client?.map(oauth => oauth.client_type) ?? []
      )
    })
  );
}

void main().catch(() => {
  console.error(
    'Firebase mobile configuration could not be completed. Check credential permissions/connectivity and use the Firebase Console instructions. No private credential or provider response was logged.'
  );
  process.exitCode = 1;
});
