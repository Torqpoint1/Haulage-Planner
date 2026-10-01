"use server";

import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/auth/errors";
import { fieldErrors, organisationSchema } from "@/lib/auth/schemas";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { fieldErrors?: { name?: string }; formError?: string };

export async function createOrganisation(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const parsed = organisationSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organisation", {
    organisation_name: parsed.data.name,
  });
  if (error) {
    console.error("create_organisation failed", error);
    return { formError: friendlyError(error) };
  }
  redirect("/today");
}
