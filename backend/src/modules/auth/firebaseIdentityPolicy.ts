type VerifiedClaims = {
  uid: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  firebase?: { sign_in_provider?: string; identities?: Record<string, unknown> };
};

/** Call only after Firebase Admin verifies the ID token, including revocation. */
export function verifiedFirebaseIdentity(claims: VerifiedClaims) {
  const verifiedEmail = Boolean(claims.email && claims.email_verified === true);
  const phone = claims.phone_number;
  const phoneIdentities = claims.firebase?.identities?.phone;
  const verifiedPhone = Boolean(
    phone &&
    /^\+[1-9]\d{6,14}$/.test(phone) &&
    (claims.firebase?.sign_in_provider === 'phone' ||
      (Array.isArray(phoneIdentities) && phoneIdentities.includes(phone)))
  );
  return {
    verifiedEmail,
    verifiedPhone,
    verified: Boolean(claims.uid) && (verifiedEmail || verifiedPhone)
  };
}

export function firebaseUserLookup(uid: string) {
  // Matching contact details never authorize merging or binding an existing ZAWANA account.
  return { firebaseUid: uid };
}
