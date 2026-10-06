import type { Request } from "express";
import type { Role } from "@prisma/client";
import type { DecodedIdToken } from "firebase-admin/auth";

export type AuthUser = {
  id: string;
  role: Role;
  email: string;
  name: string;
  phone?: string|null;
  avatar?: string|null;
};

export type AuthRequest = Request & {
  user?: AuthUser;
  firebaseClaims?:DecodedIdToken;
};
