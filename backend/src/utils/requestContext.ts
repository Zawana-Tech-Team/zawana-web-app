import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
export const requestContext = new AsyncLocalStorage<{ requestId: string; firebaseDeadline?: number; memoizeIdentity?: boolean; identityReads: Map<string, Promise<unknown>> }>();
export const requestContextMiddleware: RequestHandler = (_req, res, next) => {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  requestContext.run({ requestId, identityReads: new Map() }, next);
};
