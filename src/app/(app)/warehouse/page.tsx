import type { Metadata } from "next";
import { connection } from "next/server";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { londonToday } from "@/lib/format";
import { loadSheets } from "@/lib/warehouse/data";
import { WarehouseView } from "./warehouse-view";

export const metadata: Metadata = { title: "Warehouse" };

const isIso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function WarehousePage({ searchParams }: PageProps<"/warehouse">) {
  const session = await requireArea("warehouse");
  await connection(); // "today" must be worked out per request
  const params = await searchParams;
  const today = londonToday();
  const date = isIso(params.date) ? params.date : today;
  const data = await loadSheets(date);
  return (
    <WarehouseView
      data={data}
      today={today}
      selectedLoadId={typeof params.load === "string" ? params.load : null}
      canTick={can(session.membership.role, "warehouse.tick")}
      canAssign={can(session.membership.role, "assets.assign")}
    />
  );
}
