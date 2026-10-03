-- Stage 5: planning core. Loads, stops, the orders on each stop, warning
-- overrides and dismissals (spec 6.8, 6.9, 7.3) and compliance zones (6.13).

-- ---------------------------------------------------------------------------
-- Loads
-- ---------------------------------------------------------------------------

create table public.loads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  load_date date not null,
  depot_id uuid not null,
  vehicle_id uuid,
  haulier_id uuid,
  crew_size smallint not null default 1 check (crew_size between 1 and 4),
  -- When the vehicle leaves the depot; ETAs are estimated from here.
  start_time time not null default '07:30',
  status text not null default 'draft'
    check (status in ('draft', 'planned', 'confirmed', 'loading', 'out', 'complete')),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  check (vehicle_id is null or haulier_id is null),
  foreign key (depot_id, organisation_id) references public.depots (id, organisation_id) on delete restrict,
  foreign key (vehicle_id, organisation_id) references public.vehicles (id, organisation_id) on delete restrict,
  foreign key (haulier_id, organisation_id) references public.hauliers (id, organisation_id) on delete restrict
);
create index loads_date_idx on public.loads (organisation_id, load_date);
create index loads_vehicle_idx on public.loads (vehicle_id);
create index loads_haulier_idx on public.loads (haulier_id);
create index loads_depot_idx on public.loads (depot_id);

select private.secure_org_table('public.loads', array['admin', 'planner']::public.app_role[]);

create table public.load_drivers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  load_id uuid not null,
  driver_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (load_id, driver_id),
  foreign key (load_id, organisation_id) references public.loads (id, organisation_id) on delete cascade,
  foreign key (driver_id, organisation_id) references public.drivers (id, organisation_id) on delete restrict
);
create index load_drivers_driver_idx on public.load_drivers (driver_id);

select private.secure_org_table('public.load_drivers', array['admin', 'planner']::public.app_role[]);

-- ---------------------------------------------------------------------------
-- Stops
-- ---------------------------------------------------------------------------

create table public.load_stops (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  load_id uuid not null,
  sequence integer not null check (sequence between 1 and 200),
  site_id uuid not null,
  eta_from time,
  eta_to time,
  booking_ref text not null default '' check (char_length(booking_ref) <= 60),
  booking_slot time,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'part_delivered', 'failed')),
  -- Delivery confirmation with the customer (all optional except "confirmed").
  confirmed boolean not null default false,
  confirmed_by text not null default '' check (char_length(confirmed_by) <= 120),
  confirmation_method text
    check (confirmation_method in ('email', 'phone', 'text', 'in_person', 'portal')),
  confirmed_at timestamptz,
  confirmation_note text not null default '' check (char_length(confirmation_note) <= 1000),
  confirmation_attachment_path text
    check (confirmation_attachment_path like organisation_id::text || '/loads/' || load_id::text || '/%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  unique (id, site_id),
  -- Deferred so stops can swap places in one statement.
  constraint load_stops_sequence_key unique (load_id, sequence) deferrable initially deferred,
  check (eta_to is null or eta_from is null or eta_to >= eta_from),
  foreign key (load_id, organisation_id) references public.loads (id, organisation_id) on delete cascade,
  foreign key (site_id, organisation_id) references public.sites (id, organisation_id) on delete restrict
);
create index load_stops_site_idx on public.load_stops (site_id);

select private.secure_org_table('public.load_stops', array['admin', 'planner']::public.app_role[]);

-- An order travels on one stop at a time, and only to its own site.
alter table public.orders add constraint orders_id_site_key unique (id, site_id);

create table public.stop_orders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  stop_id uuid not null,
  order_id uuid not null unique,
  site_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (stop_id, organisation_id) references public.load_stops (id, organisation_id) on delete cascade,
  foreign key (order_id, organisation_id) references public.orders (id, organisation_id) on delete cascade,
  foreign key (stop_id, site_id) references public.load_stops (id, site_id) on delete cascade,
  foreign key (order_id, site_id) references public.orders (id, site_id) on delete cascade
);
create index stop_orders_stop_idx on public.stop_orders (stop_id);

select private.secure_org_table('public.stop_orders', array['admin', 'planner']::public.app_role[]);

-- ---------------------------------------------------------------------------
-- Order status follows the load it's on
-- ---------------------------------------------------------------------------

create function private.order_status_for_load(load_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case load_status
    when 'loading' then 'loaded'
    when 'out' then 'out_for_delivery'
    when 'complete' then 'out_for_delivery'
    else 'planned'
  end;
$$;

create function private.stop_orders_sync_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  load_status text;
begin
  if tg_op = 'INSERT' then
    select l.status into load_status
      from public.load_stops s join public.loads l on l.id = s.load_id
     where s.id = new.stop_id;
    update public.orders
       set status = private.order_status_for_load(load_status)
     where id = new.order_id and status in ('unplanned', 'planned', 'loaded', 'out_for_delivery');
    return new;
  end if;
  update public.orders
     set status = 'unplanned'
   where id = old.order_id and status in ('planned', 'loaded');
  return old;
end;
$$;

create trigger stop_orders_sync_status
  after insert or delete on public.stop_orders
  for each row execute function private.stop_orders_sync_status();

create function private.loads_sync_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status <> 'complete' then
    update public.orders o
       set status = private.order_status_for_load(new.status)
      from public.stop_orders so
      join public.load_stops s on s.id = so.stop_id
     where s.load_id = new.id
       and o.id = so.order_id
       and o.status in ('planned', 'loaded', 'out_for_delivery');
  end if;
  return new;
end;
$$;

create trigger loads_sync_order_status
  after update of status on public.loads
  for each row execute function private.loads_sync_order_status();

-- Cancelled or delivered orders can't be put on a load.
create function private.stop_orders_check_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_status text;
begin
  select status into current_status from public.orders where id = new.order_id;
  if current_status not in ('unplanned', 'planned') then
    raise exception 'This order is % and can''t be planned.', replace(current_status, '_', ' ')
      using errcode = 'P0001', hint = 'order_not_plannable';
  end if;
  return new;
end;
$$;

create trigger stop_orders_check_order
  before insert on public.stop_orders
  for each row execute function private.stop_orders_check_order();

-- ---------------------------------------------------------------------------
-- Planning functions (SECURITY INVOKER: atomic, still under RLS)
-- ---------------------------------------------------------------------------

-- Closes gaps in a load's stop sequence.
create function private.resequence_stops(target_load uuid)
returns void
language sql
set search_path = ''
as $$
  update public.load_stops s
     set sequence = ranked.n
    from (
      select id, row_number() over (order by sequence, created_at) as n
        from public.load_stops where load_id = target_load
    ) ranked
   where s.id = ranked.id and s.sequence <> ranked.n;
$$;

-- Editing a confirmed load sends it back to planned: its warnings need checking again.
create function private.touch_load_plan(target_load uuid)
returns void
language sql
set search_path = ''
as $$
  update public.loads set status = 'planned' where id = target_load and status = 'confirmed';
  update public.loads set status = 'planned' where id = target_load and status = 'draft'
    and exists (select 1 from public.load_stops where load_id = target_load);
$$;

-- Put an order on a load: joins the stop for its site, or adds a stop at the end.
-- Moving an order from another load takes it off that load first.
create function public.add_order_to_load(target_load uuid, target_order uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  order_site uuid;
  load_status text;
  previous_load uuid;
  stop uuid;
begin
  select site_id into order_site from public.orders where id = target_order;
  if order_site is null then
    raise exception 'That order no longer exists.' using errcode = 'P0002';
  end if;
  select status into load_status from public.loads where id = target_load;
  if load_status is null then
    raise exception 'That load no longer exists.' using errcode = 'P0002';
  end if;
  if load_status in ('loading', 'out', 'complete') then
    raise exception 'This load has already left the planning stage.'
      using errcode = 'P0001', hint = 'load_locked';
  end if;

  select s.load_id into previous_load
    from public.stop_orders so join public.load_stops s on s.id = so.stop_id
   where so.order_id = target_order;
  if previous_load = target_load then
    select stop_id into stop from public.stop_orders where order_id = target_order;
    return stop;
  end if;
  if previous_load is not null then
    perform public.remove_order_from_load(target_order);
  end if;

  select id into stop from public.load_stops
   where load_id = target_load and site_id = order_site
   order by sequence limit 1;
  if stop is null then
    insert into public.load_stops (load_id, site_id, sequence)
    values (
      target_load,
      order_site,
      coalesce((select max(sequence) from public.load_stops where load_id = target_load), 0) + 1
    )
    returning id into stop;
  end if;

  insert into public.stop_orders (stop_id, order_id, site_id) values (stop, target_order, order_site);
  perform private.touch_load_plan(target_load);
  return stop;
end;
$$;

-- Take an order off its load; an empty stop goes with it.
create function public.remove_order_from_load(target_order uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  stop uuid;
  owning_load uuid;
  load_status text;
begin
  select so.stop_id, s.load_id, l.status into stop, owning_load, load_status
    from public.stop_orders so
    join public.load_stops s on s.id = so.stop_id
    join public.loads l on l.id = s.load_id
   where so.order_id = target_order;
  if stop is null then
    return;
  end if;
  if load_status in ('loading', 'out', 'complete') then
    raise exception 'This load has already left the planning stage.'
      using errcode = 'P0001', hint = 'load_locked';
  end if;
  delete from public.stop_orders where order_id = target_order;
  delete from public.load_stops s
   where s.id = stop and not exists (select 1 from public.stop_orders where stop_id = stop);
  perform private.resequence_stops(owning_load);
  update public.loads set status = 'planned' where id = owning_load and status = 'confirmed';
end;
$$;

-- Set the drop order. Every stop on the load must be listed exactly once.
create function public.reorder_stops(target_load uuid, stop_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.load_stops where load_id = target_load)
       <> coalesce(array_length(stop_ids, 1), 0)
     or exists (
       select 1 from public.load_stops s
        where s.load_id = target_load and not (s.id = any (stop_ids))
     ) then
    raise exception 'The stops changed while you were reordering. Reload and try again.'
      using errcode = 'P0001', hint = 'stops_changed';
  end if;
  update public.load_stops s
     set sequence = ordered.n
    from unnest(stop_ids) with ordinality as ordered(id, n)
   where s.id = ordered.id and s.load_id = target_load;
  perform private.touch_load_plan(target_load);
end;
$$;

revoke all on function public.add_order_to_load(uuid, uuid) from public, anon;
revoke all on function public.remove_order_from_load(uuid) from public, anon;
revoke all on function public.reorder_stops(uuid, uuid[]) from public, anon;
grant execute on function public.add_order_to_load(uuid, uuid) to authenticated;
grant execute on function public.remove_order_from_load(uuid) to authenticated;
grant execute on function public.reorder_stops(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Warning overrides and dismissals (spec 6.9, 7.3). Warnings themselves are
-- calculated live; only the planner's decision is stored.
-- ---------------------------------------------------------------------------

create table public.warning_overrides (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  load_id uuid not null,
  -- code:entity_type:entity_id, so the decision sticks to the same warning.
  warning_key text not null check (char_length(warning_key) <= 200),
  code text not null check (code ~ '^[A-Z_]{2,40}$'),
  entity_type text not null check (entity_type in ('load', 'stop', 'order')),
  entity_id uuid not null,
  kind text not null check (kind in ('override', 'dismiss')),
  reason text not null default '' check (char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (load_id, warning_key),
  check (kind = 'dismiss' or char_length(btrim(reason)) >= 3),
  foreign key (load_id, organisation_id) references public.loads (id, organisation_id) on delete cascade
);

select private.secure_org_table('public.warning_overrides', array['admin', 'planner']::public.app_role[]);

-- ---------------------------------------------------------------------------
-- Compliance zones (spec 6.13): seeded per organisation, admin-editable.
-- ---------------------------------------------------------------------------

create table public.compliance_zones (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- What a vehicle needs to enter: Euro 6/VI engine, CAZ compliance or a London HGV permit.
  requirement text not null check (requirement in ('euro_6', 'caz_compliant', 'hgv_permit')),
  -- Which vehicles the rule applies to, by gross weight.
  min_gross_kg integer check (min_gross_kg between 0 and 60000),
  max_gross_kg integer check (max_gross_kg between 0 and 60000),
  -- Whole areas ("EC") or districts ("BR1").
  postcode_districts text[] not null default '{}'
    check (array_to_string(postcode_districts, ',') ~ '^([A-Z]{1,2}([0-9][0-9A-Z]?)?(,[A-Z]{1,2}([0-9][0-9A-Z]?)?)*)?$'),
  data_updated_on date not null,
  notes text not null default '' check (char_length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  check (max_gross_kg is null or min_gross_kg is null or max_gross_kg >= min_gross_kg)
);
create unique index compliance_zones_name_key on public.compliance_zones (organisation_id, lower(name));

select private.secure_settings_table('public.compliance_zones');

-- The starting data every organisation gets. Compiled from published scheme
-- boundaries; admins should check it against the current schemes.
create table private.compliance_zone_defaults (
  name text primary key,
  requirement text not null,
  min_gross_kg integer,
  max_gross_kg integer,
  postcode_districts text[] not null,
  notes text not null default ''
);

insert into private.compliance_zone_defaults values
  ('London HGV Safety Permit', 'hgv_permit', 12001, null,
   array['E','EC','N','NW','SE','SW','W','WC','BR1','BR2','BR3','BR4','BR5','BR6','BR7','CR0','CR2','CR4','CR5','CR7','CR8','DA1','DA5','DA6','DA7','DA8','DA14','DA15','DA16','DA17','DA18','EN1','EN2','EN3','EN4','EN5','HA0','HA1','HA2','HA3','HA4','HA5','HA6','HA7','HA8','HA9','IG1','IG2','IG3','IG4','IG5','IG6','IG7','IG8','IG11','KT1','KT2','KT3','KT4','KT5','KT6','KT9','RM1','RM2','RM3','RM4','RM5','RM6','RM7','RM8','RM9','RM10','RM11','RM12','RM13','RM14','SM1','SM2','SM3','SM4','SM5','SM6','TW1','TW2','TW3','TW4','TW5','TW6','TW7','TW8','TW9','TW10','TW11','TW12','TW13','TW14','UB1','UB2','UB3','UB4','UB5','UB6','UB7','UB8','UB9','UB10','UB11'],
   'Vehicles over 12 tonnes need a valid permit across Greater London.'),
  ('London Low Emission Zone', 'euro_6', 3501, null,
   array['E','EC','N','NW','SE','SW','W','WC','BR1','BR2','BR3','BR4','BR5','BR6','BR7','CR0','CR2','CR4','CR5','CR7','CR8','DA1','DA5','DA6','DA7','DA8','DA14','DA15','DA16','DA17','DA18','EN1','EN2','EN3','EN4','EN5','HA0','HA1','HA2','HA3','HA4','HA5','HA6','HA7','HA8','HA9','IG1','IG2','IG3','IG4','IG5','IG6','IG7','IG8','IG11','KT1','KT2','KT3','KT4','KT5','KT6','KT9','RM1','RM2','RM3','RM4','RM5','RM6','RM7','RM8','RM9','RM10','RM11','RM12','RM13','RM14','SM1','SM2','SM3','SM4','SM5','SM6','TW1','TW2','TW3','TW4','TW5','TW6','TW7','TW8','TW9','TW10','TW11','TW12','TW13','TW14','UB1','UB2','UB3','UB4','UB5','UB6','UB7','UB8','UB9','UB10','UB11'],
   'Lorries over 3.5 tonnes need Euro VI or pay the daily charge.'),
  ('London Ultra Low Emission Zone', 'euro_6', null, 3500,
   array['E','EC','N','NW','SE','SW','W','WC','BR1','BR2','BR3','BR4','BR5','BR6','BR7','CR0','CR2','CR4','CR5','CR7','CR8','DA1','DA5','DA6','DA7','DA8','DA14','DA15','DA16','DA17','DA18','EN1','EN2','EN3','EN4','EN5','HA0','HA1','HA2','HA3','HA4','HA5','HA6','HA7','HA8','HA9','IG1','IG2','IG3','IG4','IG5','IG6','IG7','IG8','IG11','KT1','KT2','KT3','KT4','KT5','KT6','KT9','RM1','RM2','RM3','RM4','RM5','RM6','RM7','RM8','RM9','RM10','RM11','RM12','RM13','RM14','SM1','SM2','SM3','SM4','SM5','SM6','TW1','TW2','TW3','TW4','TW5','TW6','TW7','TW8','TW9','TW10','TW11','TW12','TW13','TW14','UB1','UB2','UB3','UB4','UB5','UB6','UB7','UB8','UB9','UB10','UB11'],
   'Vans up to 3.5 tonnes need a Euro 6 diesel engine or pay the daily charge.'),
  ('Birmingham Clean Air Zone', 'caz_compliant', null, null,
   array['B1','B2','B3','B4','B5','B7','B12','B15','B16','B18','B19'],
   'Class D: vans and lorries that are not compliant pay a daily charge.'),
  ('Bath Clean Air Zone', 'caz_compliant', null, null,
   array['BA1','BA2'],
   'Class C: vans and lorries that are not compliant pay a daily charge.'),
  ('Bradford Clean Air Zone', 'caz_compliant', null, null,
   array['BD1','BD2','BD3','BD4','BD5','BD7','BD8','BD9','BD18'],
   'Class C+: vans and lorries that are not compliant pay a daily charge.'),
  ('Bristol Clean Air Zone', 'caz_compliant', null, null,
   array['BS1','BS2','BS3','BS5','BS8'],
   'Class D: vans and lorries that are not compliant pay a daily charge.'),
  ('Portsmouth Clean Air Zone', 'caz_compliant', 3501, null,
   array['PO1','PO5'],
   'Class B: lorries that are not compliant pay a daily charge.'),
  ('Sheffield Clean Air Zone', 'caz_compliant', null, null,
   array['S1','S2','S3','S4'],
   'Class C: vans and lorries that are not compliant pay a daily charge.'),
  ('Newcastle and Gateshead Clean Air Zone', 'caz_compliant', 3501, null,
   array['NE1','NE4','NE8'],
   'Class C: lorries that are not compliant pay a daily charge.');

-- The date the default data was compiled; shown in Settings.
create function private.seed_compliance_zones(org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.compliance_zones
    (organisation_id, name, requirement, min_gross_kg, max_gross_kg, postcode_districts, data_updated_on, notes, created_by)
  select org, d.name, d.requirement, d.min_gross_kg, d.max_gross_kg, d.postcode_districts,
         date '2026-10-02', d.notes, null
    from private.compliance_zone_defaults d
  on conflict do nothing;
$$;

revoke all on function private.seed_compliance_zones(uuid) from public, anon, authenticated;

create function private.organisations_seed_reference_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_compliance_zones(new.id);
  return new;
end;
$$;

create trigger organisations_seed_reference_data
  after insert on public.organisations
  for each row execute function private.organisations_seed_reference_data();

-- Organisations that already exist get the same starting data.
select private.seed_compliance_zones(id) from public.organisations;
