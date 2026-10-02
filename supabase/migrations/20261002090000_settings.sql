-- Stage 2: organisation settings (spec 6.1-6.5, 6.13).
--
-- Every table here is configuration owned by one organisation:
--   * members of the organisation can read it (planning screens need it),
--   * only admins can change it (spec 3: Settings is admin-only),
--   * every change is audited (spec 6.14),
--   * references between tables use composite foreign keys on
--     (id, organisation_id), so a row can never point at another organisation's data.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Columns that identify a row and its owner never change after insert.
create function private.protect_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.organisation_id := old.organisation_id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  return new;
end;
$$;

-- Apply the standard settings security to a table: RLS, grants, policies and triggers.
create function private.secure_settings_table(tbl regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('revoke all on %s from anon, authenticated', tbl);
  execute format('grant select, insert, update, delete on %s to authenticated', tbl);
  execute format(
    'create policy "Members read" on %s for select to authenticated
       using (organisation_id = (select private.current_org_id()))', tbl);
  execute format(
    'create policy "Admins add" on %s for insert to authenticated
       with check (organisation_id = (select private.current_org_id()) and (select private.has_role(''admin'')))', tbl);
  execute format(
    'create policy "Admins change" on %s for update to authenticated
       using (organisation_id = (select private.current_org_id()) and (select private.has_role(''admin'')))
       with check (organisation_id = (select private.current_org_id()))', tbl);
  execute format(
    'create policy "Admins delete" on %s for delete to authenticated
       using (organisation_id = (select private.current_org_id()) and (select private.has_role(''admin'')))', tbl);
  execute format(
    'create trigger protect_identity before update on %s for each row execute function private.protect_identity()', tbl);
  execute format(
    'create trigger touch before update on %s for each row execute function private.touch_updated_at()', tbl);
  execute format(
    'create trigger audit after insert or update or delete on %s for each row execute function private.audit()', tbl);
end;
$$;

-- True when every element of `vals` is in `allowed` (used by CHECK constraints).
create function private.all_in(vals text[], allowed text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(vals <@ allowed, true);
$$;

grant execute on function private.all_in(text[], text[]) to authenticated;

-- A UK postcode in its normal form, e.g. "GL5 3AA" or "SW1A 1AA".
create domain public.uk_postcode as text
  check (value ~ '^[A-Z]{1,2}[0-9][0-9A-Z]? [0-9][A-Z]{2}$');

-- Fixed palette for colour tags (spec 6.2, 10.3).
create domain public.colour_tag as text
  check (value in ('load-1','load-2','load-3','load-4','load-5','load-6','load-7','load-8','load-9','load-10'));

-- Memberships get a composite key so drivers can link to a user in the same organisation.
alter table public.memberships
  add constraint memberships_user_org_key unique (user_id, organisation_id);

-- ---------------------------------------------------------------------------
-- 6.1 Depots
-- ---------------------------------------------------------------------------

create table public.depots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null default '' check (char_length(address) <= 500),
  postcode public.uk_postcode not null,
  latitude double precision check (latitude between 49 and 61),
  longitude double precision check (longitude between -9 and 3),
  loading_equipment text[] not null default '{}'
    check (private.all_in(loading_equipment, array['forklift','loading_dock','crane','pallet_truck','moffett'])),
  -- {"mon": {"open": "07:00", "close": "17:00"}, "sat": null, ...}; missing or null = closed.
  opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  is_default boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id)
);
create unique index depots_name_key on public.depots (organisation_id, lower(name));
create unique index depots_one_default on public.depots (organisation_id) where is_default;

-- ---------------------------------------------------------------------------
-- 6.2 Handling unit types
-- ---------------------------------------------------------------------------

create table public.unit_types (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  short_code text not null check (short_code ~ '^[A-Z0-9-]{1,8}$'),
  colour_tag public.colour_tag not null default 'load-1',
  length_mm integer not null check (length_mm between 1 and 30000),
  width_mm integer not null check (width_mm between 1 and 5000),
  height_mm integer not null check (height_mm between 1 and 5000),
  typical_weight_kg numeric(10, 1) not null default 0 check (typical_weight_kg between 0 and 50000),
  stackable boolean not null default false,
  max_stack_height integer check (max_stack_height between 1 and 20),
  must_stay_upright boolean not null default false,
  fragile boolean not null default false,
  returnable boolean not null default false,
  requires_two_people boolean not null default false,
  min_unload_method text not null default 'any' check (min_unload_method in ('any', 'forklift', 'crane')),
  securing_notes text not null default '' check (char_length(securing_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  check (stackable or max_stack_height is null)
);
create unique index unit_types_name_key on public.unit_types (organisation_id, lower(name));
create unique index unit_types_code_key on public.unit_types (organisation_id, short_code);

-- ---------------------------------------------------------------------------
-- 6.3 Vehicles and their capacity matrix
-- ---------------------------------------------------------------------------

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  registration text not null check (registration ~ '^[A-Z0-9 ]{2,10}$'),
  vehicle_type text not null check (vehicle_type in
    ('van','luton','7.5t','12t','18t','26t','artic','flatbed','curtainsider','hiab','other')),
  ownership text not null default 'owned' check (ownership in ('owned', 'hired')),
  deck_length_mm integer not null check (deck_length_mm between 1 and 20000),
  deck_width_mm integer not null check (deck_width_mm between 1 and 3000),
  deck_height_mm integer not null check (deck_height_mm between 1 and 5000),
  payload_kg integer not null check (payload_kg between 1 and 50000),
  gross_weight_kg integer not null check (gross_weight_kg between 1 and 60000),
  overall_length_m numeric(4, 1) not null check (overall_length_m between 1 and 25),
  unload_methods text[] not null default '{}'
    check (private.all_in(unload_methods, array['tail_lift','side','rear','crane'])),
  tail_lift_max_kg integer check (tail_lift_max_kg between 1 and 5000),
  crane_max_kg integer check (crane_max_kg between 1 and 50000),
  crew_size_default smallint not null default 1 check (crew_size_default in (1, 2)),
  euro_standard text not null default '' check (char_length(euro_standard) <= 20),
  london_hgv_permit boolean not null default false,
  london_hgv_permit_expires date,
  caz_compliant boolean not null default false,
  cost_per_mile numeric(8, 2) not null default 0 check (cost_per_mile >= 0),
  cost_per_driver_hour numeric(8, 2) not null default 0 check (cost_per_driver_hour >= 0),
  active boolean not null default true,
  off_road_from date,
  off_road_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  check (gross_weight_kg >= payload_kg),
  check ('tail_lift' = any (unload_methods) or tail_lift_max_kg is null),
  check ('crane' = any (unload_methods) or crane_max_kg is null),
  check (off_road_until is null or off_road_from is null or off_road_until >= off_road_from)
);
create unique index vehicles_registration_key on public.vehicles (organisation_id, registration);

-- "12 pallets or 6 stillages": how many of each unit type fit on its own (spec 6.3).
create table public.vehicle_capacities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  vehicle_id uuid not null,
  unit_type_id uuid not null,
  max_units integer not null check (max_units between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (vehicle_id, unit_type_id),
  foreign key (vehicle_id, organisation_id) references public.vehicles (id, organisation_id) on delete cascade,
  foreign key (unit_type_id, organisation_id) references public.unit_types (id, organisation_id) on delete cascade
);
create index vehicle_capacities_unit_type_idx on public.vehicle_capacities (unit_type_id);

-- ---------------------------------------------------------------------------
-- 6.4 Drivers (personal data: visible only to their organisation)
-- ---------------------------------------------------------------------------

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text not null default '' check (phone ~ '^[0-9 +()-]{0,20}$'),
  licence_categories text[] not null default '{}'
    check (private.all_in(licence_categories, array['B','B+E','C1','C1+E','C','C+E','D1','D'])),
  -- Optional link to the driver's own login (spec 6.4), always in the same organisation.
  user_id uuid,
  available_days text[] not null default '{mon,tue,wed,thu,fri}'
    check (private.all_in(available_days, array['mon','tue','wed','thu','fri','sat','sun'])),
  active boolean not null default true,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  foreign key (user_id, organisation_id) references public.memberships (user_id, organisation_id)
    on delete set null (user_id)
);
create unique index drivers_user_key on public.drivers (organisation_id, user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- 6.13 Postcode zones
-- ---------------------------------------------------------------------------

create table public.postcode_zones (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  colour_tag public.colour_tag not null default 'load-1',
  -- Postcode areas such as GL, NP, B (spec 6.13).
  postcode_areas text[] not null default '{}'
    check (array_to_string(postcode_areas, ',') ~ '^([A-Z]{1,2}(,[A-Z]{1,2})*)?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id)
);
create unique index postcode_zones_name_key on public.postcode_zones (organisation_id, lower(name));

-- ---------------------------------------------------------------------------
-- 6.5 Hauliers and rate cards
-- ---------------------------------------------------------------------------

create table public.hauliers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  haulier_type text not null default 'haulier' check (haulier_type in ('haulier', 'pallet_network', 'courier')),
  contact_name text not null default '' check (char_length(contact_name) <= 120),
  phone text not null default '' check (phone ~ '^[0-9 +()-]{0,20}$'),
  email text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  vehicle_types text[] not null default '{}'
    check (private.all_in(vehicle_types, array['van','luton','7.5t','12t','18t','26t','artic','flatbed','curtainsider','hiab','other'])),
  coverage_areas text[] not null default '{}'
    check (array_to_string(coverage_areas, ',') ~ '^([A-Z]{1,2}(,[A-Z]{1,2})*)?$'),
  services text[] not null default '{}'
    check (private.all_in(services, array['tail_lift','timed','two_person','crane'])),
  notes text not null default '' check (char_length(notes) <= 2000),
  rating smallint check (rating between 1 and 5),
  active boolean not null default true,
  -- Marketplace-ready fields (spec 6.5): stored now, not used in v1.
  is_platform_listed boolean not null default false,
  is_sponsored boolean not null default false,
  sponsored_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id)
);
create unique index hauliers_name_key on public.hauliers (organisation_id, lower(name));

create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  haulier_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  valid_from date not null,
  valid_to date,
  per_drop numeric(10, 2) not null default 0 check (per_drop >= 0),
  extra_drop numeric(10, 2) not null default 0 check (extra_drop >= 0),
  surcharge_tail_lift_per_pallet numeric(10, 2) not null default 0 check (surcharge_tail_lift_per_pallet >= 0),
  surcharge_timed numeric(10, 2) not null default 0 check (surcharge_timed >= 0),
  surcharge_remote_area numeric(10, 2) not null default 0 check (surcharge_remote_area >= 0),
  -- Postcode areas or districts that attract the remote-area surcharge, e.g. {"IV","PA20"}.
  remote_postcodes text[] not null default '{}'
    check (array_to_string(remote_postcodes, ',') ~ '^([A-Z]{1,2}[0-9]{0,2}[A-Z]?(,[A-Z]{1,2}[0-9]{0,2}[A-Z]?)*)?$'),
  surcharge_two_person numeric(10, 2) not null default 0 check (surcharge_two_person >= 0),
  waiting_per_hour numeric(10, 2) not null default 0 check (waiting_per_hour >= 0),
  waiting_free_minutes integer not null default 0 check (waiting_free_minutes between 0 and 600),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  check (valid_to is null or valid_to >= valid_from),
  foreign key (haulier_id, organisation_id) references public.hauliers (id, organisation_id) on delete cascade
);
create index rate_cards_haulier_idx on public.rate_cards (haulier_id);

create table public.rate_card_pallet_prices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  rate_card_id uuid not null,
  zone_id uuid not null,
  pallet_size text not null check (pallet_size in ('quarter', 'half', 'full')),
  price numeric(10, 2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (rate_card_id, zone_id, pallet_size),
  foreign key (rate_card_id, organisation_id) references public.rate_cards (id, organisation_id) on delete cascade,
  foreign key (zone_id, organisation_id) references public.postcode_zones (id, organisation_id) on delete cascade
);

create table public.rate_card_load_prices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  rate_card_id uuid not null,
  zone_id uuid not null,
  load_type text not null check (load_type in ('full', 'part')),
  price numeric(10, 2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (rate_card_id, zone_id, load_type),
  foreign key (rate_card_id, organisation_id) references public.rate_cards (id, organisation_id) on delete cascade,
  foreign key (zone_id, organisation_id) references public.postcode_zones (id, organisation_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Security for every settings table
-- ---------------------------------------------------------------------------

select private.secure_settings_table('public.depots');
select private.secure_settings_table('public.unit_types');
select private.secure_settings_table('public.vehicles');
select private.secure_settings_table('public.vehicle_capacities');
select private.secure_settings_table('public.drivers');
select private.secure_settings_table('public.postcode_zones');
select private.secure_settings_table('public.hauliers');
select private.secure_settings_table('public.rate_cards');
select private.secure_settings_table('public.rate_card_pallet_prices');
select private.secure_settings_table('public.rate_card_load_prices');

-- ---------------------------------------------------------------------------
-- Saving a vehicle with its capacity matrix, or a rate card with its prices,
-- happens in one transaction. SECURITY INVOKER: RLS applies as normal.
-- ---------------------------------------------------------------------------

create function public.save_vehicle_capacities(target_vehicle_id uuid, capacities jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.vehicle_capacities where vehicle_id = target_vehicle_id;
  insert into public.vehicle_capacities (vehicle_id, unit_type_id, max_units)
  select target_vehicle_id, (c ->> 'unit_type_id')::uuid, (c ->> 'max_units')::integer
  from jsonb_array_elements(capacities) c
  where coalesce((c ->> 'max_units')::integer, 0) > 0;
end;
$$;

create function public.save_rate_card_prices(target_rate_card_id uuid, pallet_prices jsonb, load_prices jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.rate_card_pallet_prices where rate_card_id = target_rate_card_id;
  delete from public.rate_card_load_prices where rate_card_id = target_rate_card_id;
  insert into public.rate_card_pallet_prices (rate_card_id, zone_id, pallet_size, price)
  select target_rate_card_id, (p ->> 'zone_id')::uuid, p ->> 'pallet_size', (p ->> 'price')::numeric
  from jsonb_array_elements(pallet_prices) p;
  insert into public.rate_card_load_prices (rate_card_id, zone_id, load_type, price)
  select target_rate_card_id, (p ->> 'zone_id')::uuid, p ->> 'load_type', (p ->> 'price')::numeric
  from jsonb_array_elements(load_prices) p;
end;
$$;

revoke all on function public.save_vehicle_capacities(uuid, jsonb) from public, anon;
revoke all on function public.save_rate_card_prices(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_vehicle_capacities(uuid, jsonb) to authenticated;
grant execute on function public.save_rate_card_prices(uuid, jsonb, jsonb) to authenticated;

-- Branding: logos live under "<organisation_id>/branding/" in the private bucket (Stage 1).
-- Only admins may replace them; the Stage 1 storage policies already scope by folder.
