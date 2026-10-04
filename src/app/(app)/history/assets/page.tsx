import type { Metadata } from "next";
import { connection } from "next/server";
import { PageContainer, PageHeader } from "@/components/shell/page";
import { can } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { loadAssetRegister } from "@/lib/assets/data";
import { HistoryNav } from "../history-nav";
import { AssetsRegister } from "./assets-register";

export const metadata: Metadata = { title: "Assets" };

export default async function AssetsPage({ searchParams }: PageProps<"/history/assets">) {
  const session = await requireArea("history");
  await connection(); // overdue is worked out against today
  const params = await searchParams;
  const register = await loadAssetRegister();
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        title="History"
        description="Returnable assets: where each one is, and what's overdue back."
      />
      <HistoryNav />
      <AssetsRegister
        register={register}
        canManage={can(session.membership.role, "assets.manage")}
        initialStatus={typeof params.status === "string" ? params.status : "all"}
        initialCustomer={typeof params.customer === "string" ? params.customer : null}
      />
    </PageContainer>
  );
}
