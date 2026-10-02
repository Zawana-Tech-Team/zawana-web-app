import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { JWT_SECRET } from "../config.js";
import type { AuthRequest, AuthUser } from "../types/auth.js";

export function tokenFor(user: AuthUser) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function auth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.user = jwt.verify(
      header.slice(7),
      JWT_SECRET
    ) as AuthUser;

    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function roles(...allowed: Role[]) {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (
      !req.user ||
      !allowed.includes(req.user.role)
    ) {
      return res
        .status(403)
        .json({ message: "Insufficient permissions" });
    }

    next();
  };
}
