import type { Metadata } from "next";
import { safeNext } from "@/lib/auth/redirects";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null, "/onboarding");
  const email = typeof params.email === "string" ? params.email : "";
  return (
    <SignUpForm
      next={next}
      defaultEmail={email}
      privacyUrl={process.env.PRIVACY_NOTICE_URL || undefined}
    />
  );
}
