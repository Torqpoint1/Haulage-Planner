@AGENTS.md

# Haulage Planner (working name)

Multi-company web app that helps SME manufacturers and distributors plan deliveries with their own
vehicles and outside hauliers. The build spec is `docs/SPEC.pdf`; section numbers below refer to it.
Build in the stages of spec section 14, in order, and only start a stage once the previous stage's
"Done when" checks pass. If the spec is unclear or seems wrong, stop and ask.

## Current stage

**Stage 0: Foundations. Complete; awaiting sign-off.**

- Done: Next.js + TypeScript (strict), Tailwind v4 design tokens, every 10.4 component, component
  gallery at `/dev/components`, light/dark mode with manual toggle, Comfortable/Compact density,
  app shell with the seven tabs (sidebar ≥1280, icon rail ≥768, bottom bar + "More" on phones),
  designed empty/loading/error states, Supabase client scaffolding, CI, unit + e2e tests,
  screenshots at 375/768/1280 in both themes.
- Next: **Stage 1: Accounts**. Sign-up, sign-in, organisations, roles, invitations, Row Level
  Security, organisation-isolation tests. Add `src/proxy.ts` (Next 16's renamed middleware) for
  Supabase session refresh at that point.

## Commands

| Task                                         | Command                                 |
| -------------------------------------------- | --------------------------------------- |
| Dev server                                   | `npm run dev`                           |
| Lint / typecheck / format                    | `npm run lint` / `typecheck` / `format` |
| Unit tests (Vitest)                          | `npm test`                              |
| End-to-end tests + screenshots               | `npm run test:e2e`                      |
| Screenshots only (written to `screenshots/`) | `npm run screenshots`                   |
| Local Supabase (needs Docker)                | `npx supabase start`                    |

Playwright builds the app and runs `next start` on port 3100 with `ENABLE_DEV_GALLERY=1`.
In the Claude Code cloud environment, Chromium is preinstalled and `@playwright/test` is pinned to
1.56.1 to match it; don't run `playwright install` there.

## Architecture

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
- `supabase/`: CLI config and (from Stage 1) migrations.

## Conventions

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
3. `npm run lint && npm run typecheck && npm test && npm run test:e2e` all pass.
