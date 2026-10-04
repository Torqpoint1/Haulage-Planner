import type { Metadata } from "next";
import { safeNext } from "@/lib/auth/redirects";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const email = typeof params.email === "string" ? params.email : "";
  return <SignInForm next={next} defaultEmail={email} linkFailed={params.confirm === "failed"} />;
}
