export type PackageProof = { password?: string; identityToken?: string };
type Verifier = () => Promise<PackageProof>;
let verifier: Verifier | null = null;

export function registerPackageVerifier(handler: Verifier) {
  verifier = handler;
  return () => { if (verifier === handler) verifier = null; };
}
export function verifyPackageAccount(): Promise<PackageProof> {
  return verifier ? verifier() : Promise.reject(new Error('Open the application to verify your account.'));
}
