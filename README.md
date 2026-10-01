# Haulage Planner

A delivery planner for small and medium-sized manufacturers and distributors that run a few
vehicles of their own and also book outside hauliers or pallet networks. It plans fuller loads,
picks the cheapest valid option, and stops failed deliveries.

The full build specification is in [`docs/SPEC.pdf`](docs/SPEC.pdf). Architecture, conventions
and the current build stage are in [`CLAUDE.md`](CLAUDE.md).

## Getting started

```bash
npm install
npx supabase start           # local Postgres, Auth and Storage (needs Docker)
cp .env.example .env.local   # then paste the publishable key from `npx supabase status`
npm run dev
```

Open http://localhost:3000, create an account and set up your company.

The component gallery is at http://localhost:3000/dev/components.

## Checks

```bash
npm run lint
npm run typecheck
npm test            # unit tests (Vitest)
npm run test:db     # organisation isolation and role tests (needs local Supabase)
npm run test:e2e    # end-to-end tests and screenshots (Playwright)
```

## Stack

Next.js (App Router) + TypeScript, Tailwind CSS with Radix primitives, Supabase (Postgres, Auth,
Row Level Security, Storage), Leaflet, Zod, Vitest and Playwright. Hosted on Vercel.
