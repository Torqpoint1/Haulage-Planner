import type { Metadata } from "next";
import { connection } from "next/server";
import { londonToday } from "@/lib/format";
import { PlanBoard } from "./plan-board";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage() {
  await connection(); // "today" must be worked out per request
  return <PlanBoard today={londonToday()} />;
}
