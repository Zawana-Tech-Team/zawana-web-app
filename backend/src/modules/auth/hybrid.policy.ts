import type { DecodedIdToken } from "firebase-admin/auth";

export class HybridAuthError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HybridAuthError";
  }
}
export function reject(code: string, status: number, message: string): never {
  throw new HybridAuthError(code, status, message);
}
export function requireFresh(
  claims: Pick<DecodedIdToken, "auth_time">,
  now = Date.now(),
) {
  if (
    !Number.isFinite(claims.auth_time) ||
    claims.auth_time * 1000 > now + 30_000 ||
    now - claims.auth_time * 1000 > 300_000
  )
    reject("PROOF_EXPIRED", 401, "Authenticate again to continue.");
}
export function requirePhone(claims: DecodedIdToken, now = Date.now()) {
  requireFresh(claims, now);
  if (
    claims.firebase?.sign_in_provider !== "phone" ||
    !/^\+959\d{6,10}$/.test(claims.phone_number || "")
  )
    reject(
      "INVALID_PHONE_PROOF",
      403,
      "Verify a Myanmar mobile number to continue.",
    );
  return claims.phone_number!;
}
export function requireProvider(claims: DecodedIdToken, provider: string) {
  if (
    !["google.com", "apple.com"].includes(provider) ||
    claims.firebase?.sign_in_provider !== provider
  )
    reject(
      "INVALID_PROVIDER",
      403,
      "This identity does not match the selected sign-in method.",
    );
}
export function requireWebProof(claims: DecodedIdToken, verifiedEmailRequired = true) {
  if (
    !["password", "google.com", "apple.com"].includes(
      claims.firebase?.sign_in_provider || "",
    )
  )
    reject(
      "PASSWORD_REQUIRED",
      403,
      "Phone sign-in requires an OTP and your account password.",
    );
  if (!claims.email || (verifiedEmailRequired && !claims.email_verified))
    reject(
      "EMAIL_VERIFICATION_REQUIRED",
      403,
      "Verify your email before continuing.",
    );
}
export function requireMember(user: {
  active: boolean;
  deletedAt?: Date | null;
  role: string;
}) {
  if (!user.active || user.deletedAt)
    reject("ACCOUNT_UNAVAILABLE", 403, "This account is unavailable.");
  if (user.role !== "member")
    reject(
      "MOBILE_ROLE_UNSUPPORTED",
      403,
      "Use the ZAWANA website for staff accounts.",
    );
}

export function requireRecentSession(session?: { authenticatedAt: Date }) {
  if (!session || Date.now() - session.authenticatedAt.getTime() > 300_000)
    reject(
      "RECENT_AUTH_REQUIRED",
      403,
      "Sign in again before changing account security.",
    );
}
