@AGENTS.md

# Haulage Planner (working name)

Multi-company web app that helps SME manufacturers and distributors plan deliveries with their own
vehicles and outside hauliers. The build spec is `docs/SPEC.pdf`; section numbers below refer to it.
Build in the stages of spec section 14, in order, and only start a stage once the previous stage's
"Done when" checks pass. If the spec is unclear or seems wrong, stop and ask.

## Current stage

**Stage 2: Settings. Complete; awaiting sign-off.** (Stages 0 and 1 signed off.)

- Done: depots (postcode, loading equipment, opening hours, one default), handling unit types
  (with a "common pallets" starter set), vehicles with the capacity matrix, unloading methods,
  compliance, running costs and off-road dates, drivers (licences, days, linked login), postcode
  zones (no overlapping areas), hauliers and rate cards (prices per zone and pallet size / load
  type, drop charges, surcharges, remote postcodes), warning thresholds, organisation name, logo
  and accent colour (applied app-wide, contrast-adjusted). 133 database tests.
- Deferred: `QuoteRequest` table (6.5) needs orders, so it lands in Stage 4. Compliance zones,
  standing runs and import/export show as "Coming soon" on the Settings page (their stages).
  The postcode cache table (spec 4) arrives with Stage 3, when sites make it worthwhile.
- Not yet: emailed invitations and password reset (need Resend); GDPR export/deletion.
- Next: **Stage 3: Customers**. Customers, sites (postcode lookup, map pin), contacts,
  verification.
- Open: no hosted Supabase project yet. postcodes.io and OpenRouteService are blocked by this
  cloud environment's network policy, so lookups fall back (depots save without a map position).

## Commands

| Task                                         | Command                                 |
| -------------------------------------------- | --------------------------------------- |
| Dev server                                   | `npm run dev`                           |
| Lint / typecheck / format                    | `npm run lint` / `typecheck` / `format` |
| Unit tests (Vitest)                          | `npm test`                              |
| Database isolation and role tests            | `npm run test:db`                       |
| End-to-end tests + screenshots               | `npm run test:e2e`                      |
| Screenshots only (written to `screenshots/`) | `npm run screenshots`                   |
| Local Supabase (needs Docker)                | `npx supabase start`                    |
| Rebuild local database from migrations       | `npx supabase db reset`                 |

`test:db` and `test:e2e` need local Supabase running; they read its URL and keys from
`npx supabase status`. In the cloud environment start Docker first (`dockerd &`), then
`npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta`.
Playwright builds the app and runs `next start` on port 3100 with `ENABLE_DEV_GALLERY=1`. A setup
project creates "Example Doors Ltd" with admin, office, warehouse and driver users and saves their
sessions in `e2e/.auth/` (gitignored); tests default to the admin. The company is seeded with
realistic settings (`seedSettings` in `e2e/support/accounts.ts`), so tests that create things use
names that don't clash with the seed.
In the Claude Code cloud environment, Chromium is preinstalled and `@playwright/test` is pinned to
1.56.1 to match it; don't run `playwright install` there.

## Architecture

- `src/app/(auth)/…`: sign-in, sign-up, onboarding (create company), `invite/[token]`. Sign-in and
  sign-up call Supabase from the browser so its per-IP rate limits apply to each visitor.
- `src/proxy.ts`: Next 16's middleware. Refreshes the session and sends signed-out visitors to
  `/sign-in?next=…`. Optimistic only; pages and actions check again.
- `src/lib/auth/`: `roles.ts` (roles, areas, capabilities: the single source for the UI and
  actions), `session.ts` (`requireMember`, `requireArea(area)` for pages, `requireCapability(cap)`
  for server actions), `schemas.ts` (Zod, shared client/server), `errors.ts` (plain-English
  messages), `redirects.ts` (`safeNext`).
- `src/app/(app)/…`: the seven tabs (Today, Plan, Orders, Customers, Warehouse, History,
  Settings) inside `AppShell`. Shared `loading.tsx` (skeletons) and `error.tsx` (plain English +
  retry). Pages that depend on "today" call `await connection()` so they render per request.
- `src/app/dev/components`: component gallery; returns 404 in production unless
  `ENABLE_DEV_GALLERY=1`.
- `src/components/ui`: design-system components (spec 10.4). Every screen builds from these.
- `src/components/shell`: navigation (`nav.ts` is the tab list), page header/container, account
  menu (theme + density).
- `src/components/map`: Leaflet map panel. Leaflet loads client-side only via `next/dynamic`.
- `src/components/theme`: theme/density provider plus an inline pre-paint script (no flash).
- `src/lib/format.ts`: **all** UK formatting (dd/mm/yyyy, 24h, kg, mm, miles, £, Europe/London).
- `src/lib/color.ts`: WCAG contrast maths and per-organisation accent derivation.
- `src/lib/rules/types.ts`: the `Warning` contract for the rules engine (checks arrive in Stage 5,
  one pure function per file, `(context) => Warning[]`).
- `src/lib/services/*`: third-party providers behind small modules so they can be swapped (spec 4).
  `tiles.ts` supports MapTiler/Stadia; never the public OSM tile servers.
- `src/lib/supabase/*`: browser and server clients (`@supabase/ssr`), publishable key only.
- `supabase/migrations/`: schema. `private` schema holds RLS helpers (`current_org_id()`,
  `my_role()`, `has_role(...)`) and triggers; API functions are `create_organisation`,
  `create_invitation`, `revoke_invitation`, `get_invitation`, `accept_invitation`.
- `tests/db/`: isolation, role and schema-guard tests against the real database.
  `fixtures.ts` creates one row in every settings table.
- `src/app/(app)/settings/<section>/`: each section is `page.tsx` (server: `requireArea`, query),
  `actions.ts` (server actions) and a client `*-manager.tsx` built on `EntityManager`.
- `src/components/settings/`: `EntityManager` (list + add/edit side panel + delete confirm),
  `EntityForm` / `FormField` / `FormSection` (forms that keep typed values on validation errors),
  `CheckboxGroup`, `ColourPicker`, `SettingsHeader`.
- `src/lib/settings/`: `options.ts` (fixed choices matching DB checks), `form.ts` (FormData →
  Zod helpers), `schemas.ts` (one parser per form), `thresholds.ts` (defaults + resolution),
  `save.ts` (`asAdmin`, `upsertRow`, `deleteRow`, DB error → plain English).
- `src/lib/services/postcodes.ts`: postcodes.io lookup that never throws (returns null).
- `src/lib/branding.ts`: logo storage paths and signed URLs; `(app)/layout.tsx` injects the
  organisation's accent colour.

## Conventions

- **Every new table** gets `id`, `organisation_id`, `created_at`, `updated_at`, `created_by`, RLS
  policies scoped with `private.current_org_id()` (and `private.has_role(...)` for writes), the
  `private.audit()` trigger if spec 6.14 covers it, and an entry in `TABLES` in
  `tests/db/isolation.test.ts`. `tests/db/schema.test.ts` fails if RLS or the columns are missing,
  or if `anon` has any table privilege. Revoke default grants and grant only what's needed.
- **Settings tables** call `private.secure_settings_table('public.x')` in their migration (RLS:
  members read, admins write; identity columns locked; audit trigger). References between
  organisation tables use composite foreign keys on `(id, organisation_id)` so a row can never
  point at another organisation's data; parents need `unique (id, organisation_id)`.
- **Forms** use plain named inputs inside `EntityForm`; field names match DB columns, the server
  action parses `formObject(formData)` with the shared schema, and returns `{ ok, errors }` keyed
  by field name. Multi-row saves (capacities, rate card prices) go through SECURITY INVOKER
  database functions so they're atomic and still under RLS.
- **Lists** pass `renderCard` to `DataTable` so phones and tablets get stacked cards instead of a
  sideways-scrolling table.
- **Roles are enforced three times**: hidden in the UI (`navFor`, `can`), checked in pages and
  server actions (`requireArea` / `requireCapability`), and enforced by RLS. Never rely on the
  first alone. Server actions return `{ ok, error }` with plain-English errors.
- **Design tokens only.** `globals.css` resets Tailwind's scales so only spec values exist:
  spacing 0/px/1/2/3/4/6/8/12/16 (= 4…64px), named sizes (`h-control`, `w-sidebar`, `max-w-panel`…),
  text `xs/sm/base/lg/xl/2xl` (12–32px), weights 400/500/600, radius `sm/md/lg/full`, breakpoints
  `md` (768) and `xl` (1280) only. `src/design/__tests__/class-usage.test.ts` fails on one-off
  spacing, sizes, weights, radii, raw palette colours and arbitrary `[…]` values. Need a new size?
  Add a named token in `globals.css` (and to `src/lib/cn.ts` so tailwind-merge knows it).
- **Colours** are semantic tokens (`bg-surface`, `text-text-muted`, `bg-accent`, `text-danger-fg`…)
  defined for both themes. Status colours carry meaning only (red blocking, amber check, green
  ready/complete, blue info) and always come with an icon and a label. The token contrast test
  checks WCAG AA for every text/surface pair in both themes.
- **Accent** is per organisation; inject with `accentCss(brand)` (see root layout). It
  auto-adjusts for contrast; never hard-code the blue.
- **Text never overflows**: use `truncate`/`<Truncate>` for names, `.num` (tabular, no-wrap) for
  figures, `min-w-0` on flex children. E2E tests assert no horizontal page scroll and no text
  spilling out at 375/768/1280.
- **States**: every list/panel has an `EmptyState` with a next action, a skeleton while loading,
  and an `ErrorState` with retry.
- **Accessibility**: labelled controls (`Field` wires label/hint/error), visible focus rings,
  keyboard-operable everything, non-drag alternatives for drag-and-drop.
- **Nothing industry-specific in code**: doors, tyres etc. are configuration, never special cases.
- British English in all copy. The app assists, never decides: suggestions need a click.
- Prettier (100 cols) formats everything; run `npm run format`.

## Quality gate for every stage (10.10)

1. `npm run screenshots`: review every new screen at 375/768/1280 in light and dark
   (`screenshots/<theme>/<width>/`, with per-section gallery images in `gallery/`).
2. Fix overlaps, overflow, misalignment and inconsistent spacing.
3. `npm run lint && npm run typecheck && npm test && npm run test:db && npm run test:e2e` all pass.
