import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGO_BUCKET as FILES_BUCKET } from "@/lib/branding";
import { FILE_LINK_DAYS } from "./links";
import { EXPORT_TABLES } from "./tables";

/**
 * Everything an organisation holds, for its admins to take away (spec 12, UK
 * GDPR). Read through the admin's own session, so Row Level Security decides
 * what's included: only this organisation's rows, never anyone else's.
 */

const PAGE = 1000;

type Row = Record<string, unknown>;

async function allRows(supabase: SupabaseClient, table: string, select = "*"): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Export of ${table} failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Storage paths referenced by the organisation's rows. */
export function filePaths(organisation: Row, tables: Record<string, Row[]>): string[] {
  const paths = new Set<string>();
  const add = (p: unknown) => {
    if (typeof p === "string" && p) paths.add(p);
  };
  add(organisation.logo_path);
  for (const a of tables.order_attachments ?? []) add(a.storage_path);
  for (const s of tables.load_stops ?? []) add(s.confirmation_attachment_path);
  for (const p of tables.pods ?? []) {
    add(p.signature_path);
    for (const photo of (p.photo_paths as string[] | null) ?? []) add(photo);
  }
  return [...paths].sort();
}

export async function buildExport(supabase: SupabaseClient, organisationId: string) {
  const { data: organisation, error } = await supabase
    .from("organisations")
    .select("*")
    .eq("id", organisationId)
    .single();
  if (error) throw new Error(`Export of organisations failed: ${error.message}`);

  const tables: Record<string, Row[]> = {};
  for (const table of EXPORT_TABLES) {
    tables[table] = await allRows(
      supabase,
      table,
      table === "memberships" ? "*, profile:profiles(full_name, email)" : "*",
    );
  }

  const paths = filePaths(organisation, tables);
  const files: { path: string; url: string | null }[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { data } = await supabase.storage
      .from(FILES_BUCKET)
      .createSignedUrls(batch, FILE_LINK_DAYS * 86_400, { download: true });
    for (const path of batch) {
      files.push({ path, url: data?.find((d) => d.path === path)?.signedUrl ?? null });
    }
  }

  return {
    exported_at: new Date().toISOString(),
    about:
      "Everything this organisation holds in Haulage Planner. Each table is a list of rows; ids link rows between tables. Files (logo, documents, signatures, photos) are listed with download links that expire after " +
      `${FILE_LINK_DAYS} days.`,
    organisation,
    tables,
    files,
  };
}
