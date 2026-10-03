import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { PrintShell } from "@/components/print/print-shell";
import { DeliveryNotesPrint, PickSheetPrint, RunSheetPrint } from "@/components/print/sheets";
import { canAccess } from "@/lib/auth/roles";
import { requireMember } from "@/lib/auth/session";
import { formatDateLong, fromIsoDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { loadSheets } from "@/lib/warehouse/data";

const SHEETS = {
  pick: "Pick sheet",
  run: "Run sheet",
  delivery: "Delivery notes",
} as const;

export const metadata: Metadata = { title: "Print" };

export default async function PrintLoadPage({ params }: PageProps<"/print/loads/[id]/[sheet]">) {
  const session = await requireMember();
  const role = session.membership.role;
  // Planners print from the plan, pickers from the warehouse; drivers get their run on the phone.
  if (!canAccess(role, "warehouse") && !canAccess(role, "plan")) redirect("/no-access");
  await connection();
  const { id, sheet } = await params;
  if (!(sheet in SHEETS)) notFound();
  const kind = sheet as keyof typeof SHEETS;

  const supabase = await createClient();
  const { data: row } = await supabase.from("loads").select("load_date").eq("id", id).maybeSingle();
  if (!row) notFound();
  const data = await loadSheets(row.load_date, id);
  const load = data.loads[0];
  if (!load) notFound();

  const title = SHEETS[kind];
  const back = canAccess(role, "warehouse")
    ? `/warehouse?date=${load.date}&load=${load.id}`
    : `/plan?week=${load.date}&load=${load.id}`;
  return (
    <PrintShell
      title={title}
      organisation={data.organisation}
      backHref={back}
      meta={[
        `${load.title} · ${load.subtitle}`,
        `${formatDateLong(fromIsoDate(load.date))}${load.drivers ? ` · ${load.drivers}` : ""}${load.crew > 1 ? ` · crew of ${load.crew}` : ""}`,
      ]}
    >
      {kind === "pick" ? (
        <PickSheetPrint load={load} />
      ) : kind === "run" ? (
        <RunSheetPrint load={load} />
      ) : (
        <DeliveryNotesPrint load={load} />
      )}
    </PrintShell>
  );
}
