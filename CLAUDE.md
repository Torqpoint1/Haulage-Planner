@AGENTS.md

# Haulage Planner (working name)

Multi-company web app that helps SME manufacturers and distributors plan deliveries with their own
vehicles and outside hauliers. The build spec is `docs/SPEC.pdf`; section numbers below refer to it.
Build in the stages of spec section 14, in order, and only start a stage once the previous stage's
"Done when" checks pass. If the spec is unclear or seems wrong, stop and ask.

## Current stage

**Stage 9: History and assets. Complete; awaiting sign-off.** (Stages 0–8 signed off.)

- Done: History tab with two views. "Deliveries" (`/history`) searches by customer, month or
  date range, site, order ref, PO, delivery note, vehicle, driver and haulier in one go; results
  show each load, its stops, the confirmation record, documents and proof of delivery, with totals
  and CSV export; the search lives in the URL. "Assets" (`/history/assets`) is the returnable asset
  register: where each one is, overdue first, add by number or range, mark lost/retired/back at a
  depot/at a site, change due back, full movement history. Assets move with loads: drops go on the
  vehicle when the load goes out, to the customer when the driver records the delivery (due back
  after the unit type's "Due back within" days), collections come back on the vehicle when ticked
  and everything still aboard returns to the depot when the load completes. Planners (and the
  warehouse, for drops) assign assets on the load panel and pick sheet; drivers see them on the
  stop and tick what they collected; collection-only stops need no name or signature.
  ASSET_OVERDUE now uses real data; asset collection suggestions (8.5) appear in the load panel.
  Customer page Assets tab. Standing runs (Settings): days, cut-off, start time, depot, default
  vehicle and driver, regular sites in order; opening the plan creates any missing draft loads for
  the week's run days (once each), and the load panel suggests orders for the run's sites received
  before the cut-off (later ones listed separately), added in the run's site order.
- Decisions (agreed with the user): assets live in History; due back = days per unit type;
  planner/warehouse assign assets; standing-run loads are created when the plan is opened.
  Mine: a deleted standing-run draft load isn't recreated; generation only runs for planners and
  admins and only from today; "received before cut-off" uses the order's created time against the
  cut-off on the run day (London time); a manual asset move cancels any plan for it; assets on a
  completed load can't be corrected through the POD (move the asset instead).
- Deferred: Today screen's overdue asset count (Stage 10); customer page Orders tab; other CSV
  imports.
- Not yet: emailed invitations and password reset (need Resend); GDPR export/deletion.
- Next: **Stage 10: Today and reports**.
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
sessions in `e2e/.auth/` (gitignored); tests default to the admin. "Dan Driver" is linked to a
driver with a confirmed run today (DR-4xx, `seedDriverRun`); "Rhys Relief" is a second, unlinked
driver login for the settings test. Past deliveries HS-5xx (last month and the month before,
`seedHistory`) and stillages ST-101…106 at the depot plus overdue ST-201/202 at Cotswold
Kitchens' Cheltenham showroom (`seedAssets`). Test helpers that write go through the demo admin
(`adminClient()`): the service role can't run the `private` schema's triggers. The company is seeded with
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
- `src/lib/drivers/`: `types.ts` (run shapes, `FAILURE_REASONS`, `OUTCOMES`), `data.ts`
  (`loadDriverRun`, built on `loadSheets`), `pod.ts` (`validatePod` shared phone/server,
  `podSubmissionSchema`, `PodResult` with `retry`), `queue.ts` (IndexedDB outbox), `photos.ts`
  (shrink before queuing), `navigate.ts` (map app and tel: links), `details.ts` (planner view with
  signed URLs). Tested where pure.
- `src/app/(app)/driver/`: `driver-run.tsx`, `record-sheet.tsx`, `signature-pad.tsx` (black on
  white canvas), `use-pod-queue.ts` (sends on save, on `online`, on foreground and every 20 s;
  uploads files with upsert, then `recordPod`), `actions.ts`.
- Offline: `public/sw.js` (network-first for `/driver`, cache-first for `/_next/static`; the page
  posts its loaded files to precache; sign-out posts "clear"), registered by
  `src/components/offline/offline-support.tsx` in production only.
- Drivers DB: `pods` (one per stop; `client_id` unique per organisation makes resends harmless),
  `pod_lines` (delivered vs ordered per order line). `record_pod(...)` is the only write path:
  SECURITY DEFINER because drivers can't edit stops, so it checks the caller is a driver on the
  load (or planner/admin), that files are in the stop's folder and already uploaded, and sets
  stop, order and load status. `replan_failed_order` takes a failed order off its load. Files:
  `<org>/pods/<stop>/<client id>/signature.png|photo-n.jpg`.
- Plan board: `pod-modal.tsx` / `pod-actions.ts` show a stop's POD from the load panel.
- PostgREST embeds between tables joined by two composite keys are ambiguous (e.g.
  `pod_lines → order_lines`); name the key (`order_lines!pod_lines_order_line_id_organisation_id_fkey`)
  or query separately, and check `error`.
- `src/lib/assets/`: `options.ts` (statuses), `numbers.ts` (parse "ST-101 to ST-120"; tested),
  `data.ts` (`loadAssetRegister`, `loadAssetMovements`: places in words). `src/components/assets/`:
  `stop-assets.tsx` (drops and collections on a stop, used by the plan panel and warehouse),
  `asset-picker.tsx`, `asset-status.tsx`. `src/app/(app)/plan/asset-actions.ts` (`addDrops`,
  `addCollection`, `removeStopAsset`); `history/assets/` (register, `actions.ts`).
- Assets DB: `assets` (status with matching place columns, enforced by checks), `asset_movements`
  (written only by trigger on any change of place, using `app.asset_load/stop/note` settings for
  context and `clock_timestamp()` so moves in one transaction stay in order), `stop_assets` (drop or
  collect per stop; one pending plan per asset). `unit_types.return_days`. Functions
  `add_collection`, `move_asset`; `record_pod(..., collected)` moves stop assets; a trigger on
  loads moves drops on `out` and returns everything aboard on `complete`. `pods.collection_only`.
- `src/lib/suggestions/collections.ts` (8.5) and `standing-run.ts` (cut-off filter, site order);
  both tested and run in `adviseLoad`.
- Standing runs DB: `standing_runs`, `standing_run_sites` (settings tables), `standing_run_days`
  (generated days), `loads.standing_run_id`; `save_standing_run`, `generate_standing_loads`
  (called by the plan page). `settings/standing-runs/`.
- History: `search_history(...)` (SQL, SECURITY INVOKER) returns matching order/stop/load ids;
  `src/lib/history/filters.ts` (URL filters, month → range; tested) and `search.ts` (details,
  signed document links). `history/history-search.tsx`, `history-nav.tsx`.
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
