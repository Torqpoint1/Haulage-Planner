import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-heading";
import { homePath } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  const session = await requireUser();
  if (session.membership) redirect(homePath(session.membership.role));

  return (
    <>
      <AuthHeading
        title="Set up your company"
        description={`Signed in as ${session.email}. You'll be the admin and can invite your team next.`}
      />
      <OnboardingForm />
      <p className="mt-6 text-sm text-text-muted">
        Joining a colleague&apos;s company instead? Open the invitation link they sent you.
      </p>
    </>
  );
}
