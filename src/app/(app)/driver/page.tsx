import type { Metadata } from "next";
import { connection } from "next/server";
import { requireArea } from "@/lib/auth/session";
import { loadDriverRun } from "@/lib/drivers/data";
import { DriverRunView } from "./driver-run";

export const metadata: Metadata = { title: "My run" };

export default async function DriverPage({ searchParams }: PageProps<"/driver">) {
  const session = await requireArea("driver");
  await connection(); // "today" must be worked out per request
  const params = await searchParams;
  const run = await loadDriverRun({
    userId: session.userId,
    isAdmin: session.membership.role === "admin",
    driverId: typeof params.driver === "string" ? params.driver : null,
  });
  return (
    <DriverRunView
      run={run}
      userId={session.userId}
      organisationId={session.membership.organisation.id}
    />
  );
}
