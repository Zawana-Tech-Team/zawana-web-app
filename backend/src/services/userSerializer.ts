import type { User } from "@prisma/client";

export type SafeAppUser = Pick<
  User,
  "id" | "name" | "email" | "phone" | "role" | "membership" | "avatar"
>;

export function toSafeAppUser(user: SafeAppUser): SafeAppUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    membership: user.membership,
    avatar: user.avatar
  };
}
