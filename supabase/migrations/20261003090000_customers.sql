-- Stage 3: customers, delivery sites, contacts (spec 6.6) and a postcode cache (spec 4).
--
-- Spec 3: planners and admins create and edit customers and sites; office staff only view.
-- Every member can read them (drivers will need site details on their run sheets).

-- Like private.secure_settings_table, but with the roles allowed to write as a parameter.
create function private.secure_org_table(tbl regclass, writers public.app_role[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  can_write text := format('(select private.has_role(variadic %L::public.app_role[]))', writers);
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('revoke all on %s from anon, authenticated', tbl);
  execute format('grant select, insert, update, delete on %s to authenticated', tbl);
  execute format(
    'create policy "Members read" on %s for select to authenticated
       using (organisation_id = (select private.current_org_id()))', tbl);
  execute format(
    'create policy "Editors add" on %s for insert to authenticated
       with check (organisation_id = (select private.current_org_id()) and %s)', tbl, can_write);
  execute format(
    'create policy "Editors change" on %s for update to authenticated
       using (organisation_id = (select private.current_org_id()) and %s)
       with check (organisation_id = (select private.current_org_id()))', tbl, can_write);
  execute format(
    'create policy "Editors delete" on %s for delete to authenticated
       using (organisation_id = (select private.current_org_id()) and %s)', tbl, can_write);
  execute format(
    'create trigger protect_identity before update on %s for each row execute function private.protect_identity()', tbl);
  execute format(
    'create trigger touch before update on %s for each row execute function private.touch_updated_at()', tbl);
  execute format(
    'create trigger audit after insert or update or delete on %s for each row execute function private.audit()', tbl);
end;
$$;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  account_ref text not null default '' check (char_length(account_ref) <= 40),
  default_delivery_instructions text not null default '' check (char_length(default_delivery_instructions) <= 2000),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id)
);
create unique index customers_account_ref_key on public.customers (organisation_id, lower(account_ref))
  where account_ref <> '';
create index customers_name_idx on public.customers (organisation_id, lower(name));

-- ---------------------------------------------------------------------------
-- Sites: everything a planner needs to know before sending a vehicle
-- ---------------------------------------------------------------------------

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  customer_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null default '' check (char_length(address) <= 500),
  postcode public.uk_postcode not null,
  latitude double precision check (latitude between 49 and 61),
  longitude double precision check (longitude between -9 and 3),
  -- 'postcode' when placed by lookup, 'manual' when someone moved the pin.
  location_source text check (location_source in ('postcode', 'manual')),

  -- Access
  max_vehicle_type text check (max_vehicle_type in
    ('van','luton','7.5t','12t','18t','26t','artic','flatbed','curtainsider','hiab','other')),
  max_length_m numeric(4, 1) check (max_length_m between 1 and 25),
  max_weight_kg integer check (max_weight_kg between 1 and 60000),
  no_hgvs boolean not null default false,
  height_limit_m numeric(3, 1) check (height_limit_m between 1 and 10),
  narrow_access_note text not null default '' check (char_length(narrow_access_note) <= 500),
  parking_note text not null default '' check (char_length(parking_note) <= 500),

  -- Unloading at site
  site_equipment text[] not null default '{}'
    check (private.all_in(site_equipment, array['forklift','moffett','pump_truck'])),
  handball_allowed boolean not null default false,
  handball_people smallint check (handball_people between 1 and 6),
  crane_drop_allowed boolean not null default false,

  -- Booking
  booking_required boolean not null default false,
  booking_lead_hours integer check (booking_lead_hours between 0 and 720),
  how_to_book text not null default '' check (char_length(how_to_book) <= 500),
  opening_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(opening_hours) = 'object'),
  delivery_windows jsonb not null default '{}'::jsonb check (jsonb_typeof(delivery_windows) = 'object'),

  -- Site rules
  ppe_required boolean not null default false,
  induction_required boolean not null default false,
  contact_must_be_present boolean not null default false,

  -- Info freshness
  last_verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,

  delivery_instructions text not null default '' check (char_length(delivery_instructions) <= 2000),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  unique (id, customer_id),
  foreign key (customer_id, organisation_id) references public.customers (id, organisation_id) on delete cascade,
  check (handball_allowed or handball_people is null),
  check (booking_required or booking_lead_hours is null),
  check ((latitude is null) = (longitude is null))
);
create index sites_customer_idx on public.sites (customer_id);
create index sites_postcode_idx on public.sites (organisation_id, postcode);

-- ---------------------------------------------------------------------------
-- Contacts: belong to a customer, optionally to one of its sites
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  customer_id uuid not null,
  site_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  job_role text not null default '' check (char_length(job_role) <= 80),
  phone text not null default '' check (phone ~ '^[0-9 +()-]{0,20}$'),
  email text not null default '' check (email = '' or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (customer_id, organisation_id) references public.customers (id, organisation_id) on delete cascade,
  -- The site must belong to the same customer.
  foreign key (site_id, customer_id) references public.sites (id, customer_id) on delete set null (site_id)
);
create index contacts_customer_idx on public.contacts (customer_id);
create index contacts_site_idx on public.contacts (site_id);

-- ---------------------------------------------------------------------------
-- Postcode lookups (spec 4: "cache results in our database"). Kept per organisation
-- so one company's lookups can never affect another's pins.
-- ---------------------------------------------------------------------------

create table public.postcode_lookups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  postcode public.uk_postcode not null,
  latitude double precision not null check (latitude between 49 and 61),
  longitude double precision not null check (longitude between -9 and 3),
  district text not null default '' check (char_length(district) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (organisation_id, postcode)
);

select private.secure_org_table('public.customers', array['admin', 'planner']::public.app_role[]);
select private.secure_org_table('public.sites', array['admin', 'planner']::public.app_role[]);
select private.secure_org_table('public.contacts', array['admin', 'planner']::public.app_role[]);
select private.secure_org_table('public.postcode_lookups', array['admin', 'planner']::public.app_role[]);

-- Cache entries aren't business records; don't fill the audit log with them.
drop trigger audit on public.postcode_lookups;

-- "Mark as verified" (spec 9.4): records who checked the site and when.
create function public.verify_site(target_site_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stamp timestamptz := now();
begin
  update public.sites
     set last_verified_at = stamp, verified_by = auth.uid()
   where id = target_site_id;
  if not found then
    raise exception 'Site not found.' using errcode = 'P0002';
  end if;
  return stamp;
end;
$$;

revoke all on function public.verify_site(uuid) from public, anon;
grant execute on function public.verify_site(uuid) to authenticated;
