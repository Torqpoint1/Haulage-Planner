-- Stage 6: road distances (spec 4: OpenRouteService HGV profile, cached).
-- One row per direction between two points, keyed by rounded coordinates.

create table public.route_legs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  -- "51.73602,-2.22381" (5 decimal places, about a metre).
  from_key text not null check (from_key ~ '^-?\d{1,2}\.\d{5},-?\d{1,3}\.\d{5}$'),
  to_key text not null check (to_key ~ '^-?\d{1,2}\.\d{5},-?\d{1,3}\.\d{5}$'),
  miles numeric(8, 2) not null check (miles >= 0),
  minutes numeric(8, 1) not null check (minutes >= 0),
  -- [[lat, lng], …] for drawing the route, when the provider gave one.
  geometry jsonb check (geometry is null or jsonb_typeof(geometry) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (organisation_id, from_key, to_key)
);

-- Anyone who can see the plan may fill the cache while viewing it.
select private.secure_org_table(
  'public.route_legs',
  array['admin', 'planner', 'warehouse', 'driver', 'office']::public.app_role[]
);

-- Cache entries aren't business records; don't fill the audit log with them.
drop trigger audit on public.route_legs;
