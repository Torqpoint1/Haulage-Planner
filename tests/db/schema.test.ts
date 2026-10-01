import { describe, expect, it } from "vitest";
import { sql } from "./helpers";

/**
 * Guards for every future table (spec 5, 6, 12): Row Level Security is on,
 * each business table carries organisation_id and the standard columns, and
 * signed-out visitors have no table privileges at all.
 */

const tables = await sql<{ table_name: string; rls: boolean }>(`
  select c.relname as table_name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by 1
`);

const columns = await sql<{ table_name: string; column_name: string }>(`
  select table_name, column_name from information_schema.columns where table_schema = 'public'
`);

const has = (table: string, column: string) =>
  columns.some((c) => c.table_name === table && c.column_name === column);

/** Tables that are the organisation, or belong to a user rather than an organisation. */
const NOT_ORG_SCOPED = ["organisations", "profiles"];
/** Append-only tables never change after insert, so have no updated_at/created_by. */
const APPEND_ONLY = ["audit_log"];

describe("database guards", () => {
  it("finds the public tables", () => {
    expect(tables.map((t) => t.table_name)).toEqual(
      expect.arrayContaining([
        "organisations",
        "memberships",
        "invitations",
        "audit_log",
        "profiles",
      ]),
    );
  });

  it.each(tables.map((t) => [t.table_name, t.rls] as const))(
    "%s has Row Level Security on",
    (_, rls) => {
      expect(rls).toBe(true);
    },
  );

  it.each(tables.filter((t) => !NOT_ORG_SCOPED.includes(t.table_name)).map((t) => t.table_name))(
    "%s has organisation_id",
    (table) => {
      expect(has(table, "organisation_id")).toBe(true);
    },
  );

  it.each(tables.map((t) => t.table_name))("%s has the standard columns", (table) => {
    expect(has(table, "id")).toBe(true);
    expect(has(table, "created_at")).toBe(true);
    if (!APPEND_ONLY.includes(table)) expect(has(table, "updated_at")).toBe(true);
    if (!APPEND_ONLY.includes(table) && table !== "profiles")
      expect(has(table, "created_by")).toBe(true);
  });

  it("signed-out visitors have no privileges on any table", async () => {
    const grants = await sql(`
      select table_name, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
    `);
    expect(grants).toEqual([]);
  });

  it("every SECURITY DEFINER function pins its search_path", async () => {
    const unsafe = await sql(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
    `);
    expect(unsafe).toEqual([]);
  });
});
