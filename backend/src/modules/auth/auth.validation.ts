import { z } from "zod";

export const databaseLoginSchema = z
  .object({ username: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) })
  .strict();
export const databaseRegistrationSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z
      .string()
      .trim()
      .email()
      .transform(value => value.toLowerCase()),
    phone: z.string().trim().min(7).max(30),
    password: z.string().min(8).max(128)
  })
  .strict();
export const completeProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(30)
});

export function normalizePhone(value: string) {
  const phone = value.replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(phone))
    throw Object.assign(new Error("Enter a valid phone number with country code where needed."), {
      statusCode: 400
    });
  return phone;
}
