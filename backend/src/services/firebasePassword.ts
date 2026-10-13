import { verifyFirebaseIdToken } from "./firebaseAdmin.js";
import { reject } from "../modules/auth/hybrid.policy.js";

export async function firebaseAuthRequest(
  action: string,
  payload: Record<string, unknown>,
) {
  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key)
    reject(
      "AUTH_CONFIGURATION",
      503,
      "Password authentication is not configured.",
    );
  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch {
    return reject(
      "AUTH_UNAVAILABLE",
      503,
      "Authentication is temporarily unavailable.",
    );
  }
  const result = (await response.json().catch(() => null)) as Record<
    string,
    any
  > | null;
  if (!response.ok) {
    const code = String(result?.error?.message || "").split(" : ")[0];
    if (["EMAIL_EXISTS", "CREDENTIAL_ALREADY_IN_USE"].includes(code))
      reject(
        "IDENTITY_CONFLICT",
        409,
        "Sign in to your existing account and explicitly link this identity.",
      );
    if (["TOO_MANY_ATTEMPTS_TRY_LATER", "QUOTA_EXCEEDED"].includes(code))
      reject("RATE_LIMITED", 429, "Wait before trying again.");
    if (response.status >= 500)
      reject(
        "AUTH_UNAVAILABLE",
        503,
        "Authentication is temporarily unavailable.",
      );
    reject(
      "INVALID_CREDENTIALS",
      401,
      "The sign-in details could not be accepted.",
    );
  }
  if (!result)
    reject(
      "AUTH_UNAVAILABLE",
      503,
      "Authentication is temporarily unavailable.",
    );
  return result;
}
export async function verifyFirebasePassword(email: string, password: string) {
  const result = await firebaseAuthRequest("signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
  if (result.mfaPendingCredential || result.mfaInfo)
    reject(
      "MFA_REQUIRED",
      403,
      "Complete additional verification on the ZAWANA website.",
    );
  if (typeof result.idToken !== "string")
    reject(
      "INVALID_CREDENTIALS",
      401,
      "The sign-in details could not be accepted.",
    );
  const claims = await verifyFirebaseIdToken(result.idToken);
  if (
    claims.email?.toLowerCase() !== email.toLowerCase() ||
    claims.uid !== result.localId ||
    claims.firebase.sign_in_provider !== "password"
  )
    reject(
      "INVALID_CREDENTIALS",
      401,
      "The sign-in details could not be accepted.",
    );
  // Firebase refresh credentials remain server-local and are never forwarded or persisted.
  return claims;
}
