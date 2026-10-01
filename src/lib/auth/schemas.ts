import { z } from "zod";
import { ROLES } from "./roles";

/** Validation shared by the forms and the server (spec 4: Zod on both sides). */

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const PASSWORD_MIN = 10;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120, "Use 120 characters or fewer."),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(72, "Use 72 characters or fewer."),
});

export const organisationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your company's name.")
    .max(120, "Use 120 characters or fewer."),
});

export const inviteSchema = z.object({
  email,
  role: z.enum(ROLES, "Choose a role."),
});

export const changeRoleSchema = z.object({
  membershipId: z.uuid(),
  role: z.enum(ROLES),
});

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** First error per field, for showing under each input. */
export function fieldErrors<T>(error: z.ZodError<T>): FieldErrors<T> {
  const out: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof T;
    if (key !== undefined && !out[key]) out[key] = issue.message;
  }
  return out;
}
