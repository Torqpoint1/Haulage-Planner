@AGENTS.md

# Haulage Planner (working name)

Multi-company web app that helps SME manufacturers and distributors plan deliveries with their own
vehicles and outside hauliers. The build spec is `docs/SPEC.pdf`; section numbers below refer to it.
Build in the stages of spec section 14, in order, and only start a stage once the previous stage's
"Done when" checks pass. If the spec is unclear or seems wrong, stop and ask.

## Current stage

**Stage 7: Warehouse. Complete; awaiting sign-off.** (Stages 0–6 signed off.)

- Done: warehouse screen (`/warehouse?date=&load=`): day picker, the day's loads with picked and
  loaded progress, and a pick sheet per load in load order (last drop first) showing order ref,
  customer, PO, quantities, handling notes and load securing notes from the unit settings.
  Large Picked / Loaded / Shortage buttons; a shortage needs a note. Progress and shortages show
  to the planner on the load card and in the load panel. A4 print layouts (spec 10.8) for the pick
  sheet, driver run sheet and delivery notes: black and white, organisation logo, page numbers,
  no app chrome; printed from the warehouse or the plan panel.
- Decisions (mine): "delivery note summary" is one signed delivery note per drop (a page each);
  ticks are kept per order line while the order is on a load and cleared if it comes off; loads
  that are out or complete can't be ticked; office staff can print but not open the warehouse.
- Deferred: asset collection suggestions (8.5) and returnable assets (Stage 9); customer page
  Orders tab; other CSV imports.
- Not yet: emailed invitations and password reset (need Resend); GDPR export/deletion.
- Next: **Stage 8: Drivers**.
- Open: no hosted Supabase project yet. postcodes.io and OpenRouteService are blocked by this
  cloud environment's network policy; browser tests use `e2e/support/mock-postcodes.mjs`
  (`POSTCODES_API_URL=http://localhost:3199`) and `e2e/support/mock-ors.mjs`
  (`ORS_API_URL=http://localhost:3198`, roads = straight line × 1.25 at 40 mph), both started by
  Playwright. Playwright reuses servers already running on those ports locally.

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
- `src/lib/rules/types.ts`: the `Warning` contract for the rules engine (checks live alongside,
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
- `src/lib/services/postcodes.ts`: postcodes.io lookup that never throws (returns null);
  `POSTCODES_API_URL` overrides the base URL. `src/lib/customers/locate.ts` checks the
  organisation's `postcode_lookups` cache first.
- `src/app/(app)/customers/`: list, `[id]` (tabs: sites, contacts, orders, assets, notes) and
  `[id]/sites/[siteId]` (restrictions, freshness, draggable pin). All actions in `actions.ts`
  use `withCapability("customers.edit", …)`.
- `src/lib/customers/`: `schemas.ts` (customer/site/contact parsers), `sites.ts`
  (`siteRestrictions` plain-English chips, `siteFreshness` stale check), `types.ts`.
- `src/app/(app)/orders/`: list (`page.tsx` queries with `ilike` on `search_text`;
  `orders-list.tsx` filters, saved filters, export), `new`, `[id]` (detail, readiness, documents,
  history), `[id]/edit`, `import` (wizard). `order-form.tsx` is shared; all actions in
  `actions.ts` use `withCapability("orders.edit", …)`.
- `src/lib/orders/`: `schemas.ts` (`parseOrder`, lines as `line_<n>_<column>`), `import.ts`
  (field list, `suggestMapping`, pure `planOrderImport` that validates every row), `history.ts`
  (audit rows → readable events), `summary.ts` ("6 DP · 2 EUR", weights), `options.ts`, `types.ts`.
- `src/lib/csv.ts` (RFC 4180 parse/write, formula-injection safe) and `src/lib/download.ts`.
- Orders DB: `save_order(id, order, lines)` and `import_orders(orders)` are SECURITY INVOKER and
  atomic. `orders.search_text` is maintained by triggers (including when a customer or site is
  renamed) and indexed with pg_trgm. Members may read `audit_log` rows for order tables only.
- `src/lib/rules/`: the rules engine (spec 7). `context.ts` (`RuleContext`: everything a check
  reads, already loaded), `checks/<code>.ts` (one pure `(ctx) => Warning[]` per check),
  `index.ts` (`CHECKS`, `runChecks`, `withDecisions`, `unresolvedBlocking`, `warningKey`),
  helpers `capacity.ts` (matrix, else floor space with stacking), `unloading.ts` (which methods
  work for a unit at a site), `estimate.ts` (run estimate), `time.ts` (London times).
  Fixes are `{ id, label, params }`; the plan board maps ids (`switch-vehicle`, `remove-order`,
  `set-crew`, `edit-stop`, `edit-load`, `move-load-date`, `verify-site`) to actions.
  `switchVehicleFixes` re-runs the same check with each free vehicle to offer only ones that fix it.
- `src/lib/planning/`: `data.ts` (server: one week of loads, orders, sites, fleet, zones,
  decisions), `build.ts` (load → `RuleContext`, metrics, warnings; also the drag preview),
  `schemas.ts`, `types.ts`, `labels.ts`.
- `src/app/(app)/plan/`: `page.tsx` (search params week/view/day/weekend/load), `plan-board.tsx`
  (dnd-kit, pointer-based drop), `order-pool.tsx`, `load-card.tsx`, `load-panel.tsx`,
  `load-form.tsx`, `actions.ts` (`loads.edit`; status via `plans.approve`; overrides via
  `warnings.override`).
- Planning DB: `loads`, `load_drivers`, `load_stops` (booking + confirmation fields),
  `stop_orders` (one stop per order, same site enforced by composite keys), `warning_overrides`
  (override or dismiss, keyed `code:entity_type:entity_id`), `compliance_zones` (seeded from
  `private.compliance_zone_defaults` when an organisation is created). Functions
  `add_order_to_load`, `remove_order_from_load`, `reorder_stops` (atomic, SECURITY INVOKER).
  Order status follows its load by trigger; editing a confirmed load sends it back to planned.
- `src/lib/routing/`: `legs.ts` (shared: `pointKey`, `legKey`, `legBetween` = road leg or
  estimate; `crowMiles`), `server.ts` (`routeLegs` with shapes for loads, `matrixLegs` for
  suggestions; cache first, provider second, never throws). `RuleContext.legs` feeds
  `estimateRun`, which reports `roadDistances`.
- `src/lib/suggestions/`: pure engines with tests: `options.ts` (`deliveryOptions`,
  `palletSize`), `suggest-loads.ts` (`suggestLoads`, `dayFor`), `fill-gaps.ts`, `stop-order.ts`
  (`nearestNeighbour`, `untangle`, `suggestStopOrder`); `server.ts` runs them with road
  distances. The plan board's `proposal-card.tsx`, `load-advice.tsx`, `options-list.tsx` and
  `compare-modal.tsx` show them.
- `src/lib/warehouse/`: `pick-sheet.ts` (pure `pickSheet`: stops reversed into load order,
  `handlingNotes`, totals; tested), `data.ts` (`loadSheets(date, loadId?)`: everything the
  warehouse screen and print layouts need, including ETAs and site contacts).
- Warehouse DB: `pick_lines` (one row per order line on a load: picked/loaded with who and when,
  shortage + note; cascades away when the order leaves the load). `tick_line(...)` is the only
  write path (SECURITY INVOKER; warehouse, planner, admin). `PlanData.picking` feeds the cards.
- `src/app/print/`: print layouts outside the app shell (`print.css`, plain black on white, not
  themed tokens). `loads/[id]/[sheet]` with sheet = pick | run | delivery; `PrintShell` adds the
  header, the screen-only toolbar and an `@page` rule (A4, page numbers in the margin).
- `src/lib/branding.ts`: logo storage paths and signed URLs; `(app)/layout.tsx` injects the
  organisation's accent colour.

## Conventions

- **Every new table** gets `id`, `organisation_id`, `created_at`, `updated_at`, `created_by`, RLS
  policies scoped with `private.current_org_id()` (and `private.has_role(...)` for writes), the
  `private.audit()` trigger if spec 6.14 covers it, and an entry in `TABLES` in
  `tests/db/isolation.test.ts`. `tests/db/schema.test.ts` fails if RLS or the columns are missing,
  or if `anon` has any table privilege. Revoke default grants and grant only what's needed.
- **Non-settings tables** call `private.secure_org_table('public.x', array['admin','planner']::public.app_role[])`
  with the roles allowed to write (spec 3); everyone in the organisation can read.
- **Settings tables** call `private.secure_settings_table('public.x')` in their migration (RLS:
  members read, admins write; identity columns locked; audit trigger). References between
  organisation tables use composite foreign keys on `(id, organisation_id)` so a row can never
  point at another organisation's data; parents need `unique (id, organisation_id)`.
- **Forms** use plain named inputs inside `EntityForm`; field names match DB columns, the server
  action parses `formObject(formData)` with the shared schema, and returns `{ ok, errors }` keyed
  by field name. Multi-row saves (capacities, rate card prices) go through SECURITY INVOKER
  database functions so they're atomic and still under RLS.
- **Dates** travel as yyyy-mm-dd: `toIsoDate(date)` to send, `formatIsoDate(iso)` to show.
  Never `formatDate()` a calendar date (it's for timestamps).
- **CSV imports** validate on the server with a pure planner, report problems against the
  spreadsheet row number, import valid rows all-or-nothing per batch, and send only the mapped
  columns (server action body limit is 4 MB, max 5,000 rows).
- **Warnings are calculated, never stored.** Only the planner's decision (override with reason,
  or dismissal) is stored. Anything that blocks must be re-checked on the server before it's
  allowed (see `setLoadStatus`).
- **Suggestions only propose.** Every engine returns reasons alongside the proposal; applying
  one is a separate, explicit action. Label anything estimated ("est.") and say why an option is
  invalid rather than hiding it.
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
