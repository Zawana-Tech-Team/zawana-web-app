import type { NextFunction, Response } from "express";
import type { Role } from "@prisma/client";
import type { AuthRequest } from "../types/auth.js";
import { sessions } from "../services/authSession.js";

export function createAuthMiddleware(service = sessions) {
  return function auth(req: AuthRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res
        .status(401)
        .json({
          code: "SESSION_REQUIRED",
          message: "Authentication required.",
        });
    void service
      .authenticate(header.slice(7))
      .then((session) => {
        req.user = session.user;
        req.authSession = session;
        next();
      })
      .catch(next);
  };
}
export const auth = createAuthMiddleware();
export function roles(...allowed: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role))
      return res
        .status(403)
        .json({ code: "FORBIDDEN", message: "Insufficient permissions." });
    next();
  };
}
