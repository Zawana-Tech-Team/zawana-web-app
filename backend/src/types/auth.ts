import type { Request } from "express";
import type { Role } from "@prisma/client";

export type AuthUser = {
  id: string;
  role: Role;
  email: string;
  name: string;
};

export type AuthRequest = Request & {
  user?: AuthUser;
};
