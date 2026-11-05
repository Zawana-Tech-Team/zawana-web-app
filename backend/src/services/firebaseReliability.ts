import { AsyncLocalStorage } from 'node:async_hooks';
import { Agent } from 'node:https';
import { Agent as HttpAgent, type ClientRequest, type RequestOptions } from 'node:http';
import { requestContext } from '../utils/requestContext.js';

type Signal = { transportCode?: string; upstreamStatus?: number; endpoint: string };
export const firebaseAttempt = new AsyncLocalStorage<{ deadline: number; signals: Map<string, Signal> }>();
const transientCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'EAUTHDEADLINE']);
const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);
const invalidCodes = new Set(['auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found', 'auth/invalid-id-token']);
const configCodes = new Set(['auth/invalid-credential', 'app/invalid-credential', 'auth/insufficient-permission', 'auth/project-not-found', 'app/invalid-app-options', 'AUTH_CONFIGURATION']);
const knownCodes = new Set([...invalidCodes, ...configCodes, 'auth/argument-error', 'auth/invalid-argument', 'auth/internal-error', 'auth/certificate-fetch-failed', 'app/network-error', 'app/network-timeout', ...transientCodes, 'ENOTFOUND', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT']);
const record = (value: unknown): Record<string, any> => typeof value === 'object' && value !== null ? value as Record<string, any> : {};
export function classifyFirebaseError(error: unknown, signals: Signal[] = []) {
  const e = record(error), code = knownCodes.has(e.code) ? String(e.code) : 'unknown';
  const causes: string[] = [];
  let cause = e;
  for (let i = 0; i < 5; i++) { if (knownCodes.has(cause.code)) causes.push(String(cause.code)); cause = record(cause.cause); }
  const invalid = invalidCodes.has(code);
  const signal = signals.find(s => transientCodes.has(s.transportCode || '') || transientStatuses.has(s.upstreamStatus || 0));
  const transient = !invalid && (!!signal || causes.some(c => transientCodes.has(c)) || ['app/network-timeout'].includes(code));
  const configuration = !transient && (configCodes.has(code) || signals.some(s => [400, 401, 403, 404].includes(s.upstreamStatus || 0)) || causes.some(c => ['ENOTFOUND', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(c)));
  const configurationReason = ['missing_project', 'partial_service_account', 'invalid_service_email', 'invalid_private_key', 'production_emulator', 'project_mismatch', 'initialization_failed'].includes(e.configurationReason) ? String(e.configurationReason) : null;
  return { firebaseCode: code, configurationReason, category: invalid ? 'invalid_proof' : transient ? 'transient_infrastructure' : configuration ? 'configuration' : ['auth/argument-error', 'auth/invalid-argument'].includes(code) ? 'invalid_proof' : 'unclassified_failure',
    transient, endpoint: signal?.endpoint || signals[0]?.endpoint || null, transportCode: signal?.transportCode || causes.find(c => transientCodes.has(c)) || null, upstreamStatus: signal?.upstreamStatus || signals[0]?.upstreamStatus || null };
}

/** Capture transport facts before firebase-admin converts certificate failures into argument errors. */
export class FirebaseHttpAgent extends Agent {
  addRequest(req: ClientRequest, options: RequestOptions) {
    const attempt = firebaseAttempt.getStore();
    if (attempt) {
      const host = String(options.hostname || options.host || '').split(':')[0];
      const endpoint = host === 'www.googleapis.com' ? 'certificates' : host === 'identitytoolkit.googleapis.com' ? 'identity' : host === 'oauth2.googleapis.com' || host === 'accounts.google.com' ? 'credentials' : 'google_service';
      req.once('error', error => {
        const code = record(error).code;
        if (knownCodes.has(code)) attempt.signals.set(host, { transportCode: code, endpoint });
      });
      req.once('response', response => {
        if (response.statusCode && response.statusCode >= 400) attempt.signals.set(host, { upstreamStatus: response.statusCode, endpoint });
        else attempt.signals.delete(host);
      });
      const timer = setTimeout(() => req.destroy(Object.assign(new Error('Firebase upstream deadline exceeded.'), { code: 'EAUTHDEADLINE' })), Math.max(1, Math.min(5000, attempt.deadline - Date.now())));
      timer.unref(); req.once('close', () => clearTimeout(timer));
    }
    (HttpAgent.prototype as unknown as { addRequest: (req: ClientRequest, options: RequestOptions) => void }).addRequest.call(this, req, options);
  }
}

export async function firebaseRead<T>(operation: 'verify_id_token' | 'get_identity', action: () => Promise<T>, options: {
  budgetMs?: number; random?: () => number; sleep?: (ms: number) => Promise<void>; log?: (entry: Record<string, unknown>) => void;
} = {}): Promise<T> {
  const context = requestContext.getStore(), started = Date.now();
  const deadline = context ? context.firebaseDeadline ??= started + (options.budgetMs ?? 20000) : started + (options.budgetMs ?? 20000);
  const log = options.log || (entry => console.warn(JSON.stringify(entry)));
  for (let attempt = 1; ; attempt++) {
    const state = { deadline, signals: new Map<string, Signal>() };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await firebaseAttempt.run(state, () => Promise.race([
        Promise.resolve().then(action),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Firebase verification deadline exceeded.'), { code: 'EAUTHDEADLINE' })), Math.max(1, deadline - Date.now())); }),
      ]));
    } catch (error) {
      const diagnostic = classifyFirebaseError(error, [...state.signals.values()]);
      const retry = diagnostic.transient && attempt < 2 && deadline - Date.now() > 750;
      log({ event: retry ? 'firebase_read_retry' : 'firebase_read_failed', requestId: context?.requestId || null, operation, attempt, durationMs: Date.now() - started, ...diagnostic });
      if (retry) {
        await (options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))))(250 * 2 ** (attempt - 1) + Math.floor((options.random || Math.random)() * 125));
        continue;
      }
      const invalid = diagnostic.category === 'invalid_proof', configuration = diagnostic.category === 'configuration';
      throw Object.assign(new Error(invalid ? 'Invalid, expired, or revoked Firebase ID token.' : configuration ? 'Authentication configuration requires administrator attention.' : 'Firebase identity verification is temporarily unavailable.'), {
        statusCode: invalid ? 401 : 503, code: invalid ? 'INVALID_PROOF' : configuration ? 'AUTH_CONFIGURATION' : diagnostic.transient ? 'AUTH_UNAVAILABLE' : 'AUTH_VERIFICATION_FAILED',
        retryable: diagnostic.transient, authDiagnostic: { operation, attempt, ...diagnostic },
      });
    } finally { if (timer) clearTimeout(timer); }
  }
}
