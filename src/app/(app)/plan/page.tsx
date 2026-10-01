import type { Metadata } from "next";
import { requireArea } from "@/lib/auth/session";
import { connection } from "next/server";
import { londonToday } from "@/lib/format";
import { PlanBoard } from "./plan-board";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage() {
  await requireArea("plan");
  await connection(); // "today" must be worked out per request
  return <PlanBoard today={londonToday()} />;
}
