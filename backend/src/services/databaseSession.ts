import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

type SessionClaims = { sub: string; exp: number };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const secret = () => env.jwtSecret;

export function issueDatabaseToken(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  const head = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: userId, iat: now, exp: now + 7 * 24 * 60 * 60 });
  const body = `${head}.${payload}`;
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

export function verifyDatabaseToken(value: string): SessionClaims | null {
  try {
    const [head, payload, signature, ...rest] = value.split(".");
    if (!head || !payload || !signature || rest.length) return null;
    const body = `${head}.${payload}`;
    const expected = createHmac("sha256", secret()).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
    if (
      header.alg !== "HS256" ||
      !claims.sub ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= Date.now() / 1000
    )
      return null;
    return claims;
  } catch {
    return null;
  }
}
