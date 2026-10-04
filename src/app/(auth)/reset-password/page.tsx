import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from the reset email's link, which signs the person in first. */
export default async function ResetPasswordPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?confirm=failed");
  return <ResetPasswordForm email={session.email} />;
}
