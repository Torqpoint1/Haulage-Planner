-- Stage 9: returnable assets (spec 6.11, 8.5). Stillages, A-frames, cages and
-- the like, each with its own number, tracked as they move with loads:
--
--   at depot ──(assigned to a stop as a drop; load goes out)──▶ on vehicle
--   on vehicle ──(driver records the drop delivered)──▶ at customer (due back after the
--                                                        unit type's return days)
--   at customer ──(assigned as a collection; driver ticks it collected)──▶ on vehicle
--   on vehicle ──(load complete)──▶ at depot
--
-- Lost and retired are set by hand. Every change of place is written to
-- asset_movements by a trigger, so the history can't be skipped.

-- How long a returnable unit may stay with a customer.
alter table public.unit_types
  add column return_days smallint check (return_days between 1 and 365);
alter table public.unit_types
  add constraint unit_types_return_days_check2 check (returnable or return_days is null);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  unit_type_id uuid not null,
  asset_number text not null check (char_length(btrim(asset_number)) between 1 and 40),
  status text not null default 'at_depot'
    check (status in ('at_depot', 'on_vehicle', 'at_customer', 'lost', 'retired')),
  depot_id uuid,
  customer_id uuid,
  site_id uuid,
  load_id uuid,
  dropped_on date,
  expected_return_date date,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  -- Where it is must match its status.
  check ((status = 'at_depot') = (depot_id is not null)),
  check ((status = 'at_customer') = (site_id is not null and customer_id is not null)),
  check ((status = 'on_vehicle') = (load_id is not null)),
  check (status = 'at_customer' or (dropped_on is null and expected_return_date is null)),
  check (expected_return_date is null or dropped_on is null or expected_return_date >= dropped_on),
  foreign key (unit_type_id, organisation_id) references public.unit_types (id, organisation_id) on delete restrict,
  foreign key (depot_id, organisation_id) references public.depots (id, organisation_id) on delete restrict,
  foreign key (customer_id, organisation_id) references public.customers (id, organisation_id) on delete restrict,
  foreign key (site_id, customer_id) references public.sites (id, customer_id) on delete restrict,
  foreign key (load_id, organisation_id) references public.loads (id, organisation_id) on delete restrict
);
create unique index assets_number_key on public.assets (organisation_id, lower(btrim(asset_number)));
create index assets_site_idx on public.assets (site_id) where site_id is not null;
create index assets_load_idx on public.assets (load_id) where load_id is not null;
create index assets_unit_type_idx on public.assets (unit_type_id);
create index assets_depot_idx on public.assets (depot_id);
create index assets_customer_idx on public.assets (customer_id);

select private.secure_org_table('public.assets', array['admin', 'planner']::public.app_role[]);

-- Only returnable unit types are tracked as assets.
create function private.assets_check_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.unit_types u where u.id = new.unit_type_id and u.returnable) then
    raise exception 'Only returnable handling units can be tracked as assets.'
      using errcode = 'P0001', hint = 'not_returnable';
  end if;
  return new;
end;
$$;
create trigger assets_check_type before insert or update of unit_type_id on public.assets
  for each row execute function private.assets_check_type();

-- ---------------------------------------------------------------------------
-- Movements: written by trigger whenever an asset changes place
-- ---------------------------------------------------------------------------

create table public.asset_movements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  asset_id uuid not null,
  from_status text,
  to_status text not null,
  from_depot_id uuid,
  from_site_id uuid,
  to_depot_id uuid,
  to_site_id uuid,
  load_id uuid,
  stop_id uuid,
  note text not null default '',
  moved_at timestamptz not null default now(),
  moved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade
);
create index asset_movements_asset_idx on public.asset_movements (asset_id, moved_at);

-- Read by everyone in the organisation; written only by the trigger below.
select private.secure_org_table('public.asset_movements', array[]::public.app_role[]);
drop trigger audit on public.asset_movements;

create function private.assets_record_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.depot_id is not distinct from old.depot_id
     and new.site_id is not distinct from old.site_id
     and new.load_id is not distinct from old.load_id then
    return null;
  end if;
  insert into public.asset_movements (
    organisation_id, asset_id, from_status, to_status, from_depot_id, from_site_id,
    to_depot_id, to_site_id, load_id, stop_id, note, moved_by, moved_at
  ) values (
    new.organisation_id, new.id,
    case when tg_op = 'UPDATE' then old.status end, new.status,
    case when tg_op = 'UPDATE' then old.depot_id end,
    case when tg_op = 'UPDATE' then old.site_id end,
    new.depot_id, new.site_id,
    coalesce(new.load_id, case when tg_op = 'UPDATE' then old.load_id end,
             nullif(current_setting('app.asset_load', true), '')::uuid),
    nullif(current_setting('app.asset_stop', true), '')::uuid,
    coalesce(current_setting('app.asset_note', true), ''),
    auth.uid(),
    -- Several moves can happen in one transaction (dropped, then the load completes);
    -- the real time keeps them in order.
    clock_timestamp()
  );
  return null;
end;
$$;
create trigger assets_record_movement after insert or update on public.assets
  for each row execute function private.assets_record_movement();

-- ---------------------------------------------------------------------------
-- Assets planned onto stops: drops (going out) and collections (coming back)
-- ---------------------------------------------------------------------------

create table public.stop_assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  stop_id uuid not null,
  asset_id uuid not null,
  direction text not null check (direction in ('drop', 'collect')),
  -- pending until the driver records the stop; then done or not done.
  outcome text not null default 'pending' check (outcome in ('pending', 'done', 'not_done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (stop_id, asset_id),
  foreign key (stop_id, organisation_id) references public.load_stops (id, organisation_id) on delete cascade,
  foreign key (asset_id, organisation_id) references public.assets (id, organisation_id) on delete cascade
);
-- An asset is planned onto one stop at a time.
create unique index stop_assets_pending_key on public.stop_assets (asset_id) where outcome = 'pending';
create index stop_assets_stop_idx on public.stop_assets (stop_id);

-- Planners, and the warehouse when loading, say which assets go out.
select private.secure_org_table('public.stop_assets', array['admin', 'planner', 'warehouse']::public.app_role[]);

create function private.stop_assets_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  a record;
  stop_site uuid;
  load_status text;
  has_orders boolean;
begin
  select s.site_id, l.status, exists (select 1 from public.stop_orders so where so.stop_id = s.id)
    into stop_site, load_status, has_orders
    from public.load_stops s join public.loads l on l.id = s.load_id
   where s.id = new.stop_id;
  select x.status, x.site_id, x.asset_number into a from public.assets x where x.id = new.asset_id;
  if new.direction = 'drop' then
    if load_status in ('out', 'complete') then
      raise exception 'This load has already left.' using errcode = 'P0001', hint = 'load_left';
    end if;
    if not has_orders then
      raise exception 'Assets can only go out with a delivery.' using errcode = 'P0001';
    end if;
    if a.status <> 'at_depot' then
      raise exception '% isn''t at the depot.', a.asset_number using errcode = 'P0001', hint = 'asset_not_here';
    end if;
  else
    if load_status in ('loading', 'out', 'complete') then
      raise exception 'This load has already left the planning stage.'
        using errcode = 'P0001', hint = 'load_locked';
    end if;
    if a.status <> 'at_customer' or a.site_id is distinct from stop_site then
      raise exception '% isn''t at this site.', a.asset_number using errcode = 'P0001', hint = 'asset_not_here';
    end if;
  end if;
  return new;
end;
$$;
create trigger stop_assets_check before insert on public.stop_assets
  for each row execute function private.stop_assets_check();

-- Taking the last collection off a stop with no orders removes the stop.
create function private.stop_assets_tidy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owning_load uuid;
begin
  select s.load_id into owning_load from public.load_stops s where s.id = old.stop_id;
  if owning_load is null then
    return old;
  end if;
  if not exists (select 1 from public.stop_orders so where so.stop_id = old.stop_id)
     and not exists (select 1 from public.stop_assets sa where sa.stop_id = old.stop_id) then
    delete from public.load_stops s where s.id = old.stop_id and s.status = 'pending';
    perform private.resequence_stops(owning_load);
  end if;
  return old;
end;
$$;
create trigger stop_assets_tidy after delete on public.stop_assets
  for each row execute function private.stop_assets_tidy();

-- A stop survives losing its orders while it still has collections; drops go
-- with the orders.
create or replace function public.remove_order_from_load(target_order uuid)
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
  if not exists (select 1 from public.stop_orders where stop_id = stop) then
    delete from public.stop_assets where stop_id = stop and direction = 'drop';
  end if;
  delete from public.load_stops s
   where s.id = stop
     and not exists (select 1 from public.stop_orders where stop_id = stop)
     and not exists (select 1 from public.stop_assets where stop_id = stop);
  perform private.resequence_stops(owning_load);
  update public.loads set status = 'planned' where id = owning_load and status = 'confirmed';
end;
$$;

-- Add a collection to a load (spec 8.5): joins the stop for that site, or adds
-- one at the end. Returns the stop.
create function public.add_collection(target_load uuid, asset_ids uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_site uuid;
  sites integer;
  load_status text;
  stop uuid;
  asset uuid;
begin
  if coalesce(cardinality(asset_ids), 0) = 0 then
    raise exception 'Choose the assets to collect.' using errcode = '22023';
  end if;
  select count(distinct a.site_id), min(a.site_id::text)::uuid into sites, target_site
    from public.assets a where a.id = any (asset_ids);
  if sites <> 1 or target_site is null then
    raise exception 'Collect assets from one site at a time.' using errcode = '22023';
  end if;
  select status into load_status from public.loads where id = target_load;
  if load_status is null then
    raise exception 'That load no longer exists.' using errcode = 'P0002';
  end if;
  if load_status in ('loading', 'out', 'complete') then
    raise exception 'This load has already left the planning stage.'
      using errcode = 'P0001', hint = 'load_locked';
  end if;
  select id into stop from public.load_stops
   where load_id = target_load and site_id = target_site
   order by sequence limit 1;
  if stop is null then
    insert into public.load_stops (load_id, site_id, sequence)
    values (
      target_load, target_site,
      coalesce((select max(sequence) from public.load_stops where load_id = target_load), 0) + 1
    )
    returning id into stop;
  end if;
  foreach asset in array asset_ids loop
    insert into public.stop_assets (stop_id, asset_id, direction)
    values (stop, asset, 'collect')
    on conflict (stop_id, asset_id) do nothing;
  end loop;
  perform private.touch_load_plan(target_load);
  return stop;
end;
$$;

revoke all on function public.add_collection(uuid, uuid[]) from public, anon;
grant execute on function public.add_collection(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Assets follow their load
-- ---------------------------------------------------------------------------

create function private.loads_move_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.asset_load', new.id::text, true);
  if new.status = 'out' and old.status is distinct from 'out' then
    -- Drops still at the depot go on the vehicle.
    update public.assets a
       set status = 'on_vehicle', load_id = new.id, depot_id = null
      from public.stop_assets sa
      join public.load_stops s on s.id = sa.stop_id
     where s.load_id = new.id and sa.asset_id = a.id
       and sa.direction = 'drop' and sa.outcome = 'pending' and a.status = 'at_depot';
  elsif new.status = 'complete' and old.status is distinct from 'complete' then
    -- Whatever is still on the vehicle comes back to the depot.
    update public.assets a
       set status = 'at_depot', load_id = null, depot_id = new.depot_id
     where a.load_id = new.id and a.status = 'on_vehicle';
    update public.stop_assets sa
       set outcome = 'not_done'
      from public.load_stops s
     where s.id = sa.stop_id and s.load_id = new.id and sa.outcome = 'pending';
  end if;
  perform set_config('app.asset_load', '', true);
  return null;
end;
$$;
create trigger loads_move_assets after update of status on public.loads
  for each row execute function private.loads_move_assets();

-- ---------------------------------------------------------------------------
-- Recording a delivery now covers the assets at the stop too
-- ---------------------------------------------------------------------------

-- A stop with only collections has no one signing for goods.
alter table public.pods add column collection_only boolean not null default false;
alter table public.pods drop constraint pods_check1;
alter table public.pods drop constraint pods_check2;
alter table public.pods add constraint pods_received_by_required
  check (outcome = 'failed' or collection_only or char_length(btrim(received_by)) >= 2);
alter table public.pods add constraint pods_signature_required
  check (outcome = 'failed' or collection_only or signature_path is not null
         or (no_signature and cardinality(photo_paths) > 0));

drop function public.record_pod(uuid, uuid, text, text, text, boolean, text[], text, text, jsonb, timestamptz, double precision, double precision, double precision);

-- collected: the assets planned for collection here that the driver picked up.
-- A stop with only collections (no orders) needs at least one collected unless
-- it failed, and no name or signature.
create function public.record_pod(
  client_id uuid,
  target_stop uuid,
  outcome text,
  received_by text default '',
  signature_path text default null,
  no_signature boolean default false,
  photo_paths text[] default '{}',
  failure_reason text default null,
  note text default '',
  lines jsonb default '[]'::jsonb,
  recorded_at timestamptz default now(),
  latitude double precision default null,
  longitude double precision default null,
  accuracy_m double precision default null,
  collected uuid[] default '{}'
)
returns uuid
language plpgsql
-- Drivers may not edit loads or stops directly; this function checks they're
-- on the load and makes only the changes a delivery implies.
security definer
set search_path = ''
as $$
declare
  org uuid := private.current_org_id();
  me uuid := auth.uid();
  existing uuid;
  stop_load uuid;
  stop_site uuid;
  stop_customer uuid;
  stop_status text;
  load_status text;
  is_staff boolean := private.has_role('admin', 'planner');
  has_orders boolean;
  folder text;
  file_path text;
  pod uuid;
  line record;
  wanted integer;
  short_lines integer := 0;
  some_delivered boolean := false;
  line_count integer := 0;
  when_recorded timestamptz := least(coalesce(recorded_at, now()), now());
  drop_day date;
begin
  if org is null or me is null then
    raise exception 'Sign in to record deliveries.' using errcode = '42501';
  end if;

  -- The offline queue may send the same submission again.
  select p.id into existing from public.pods p
   where p.client_id = record_pod.client_id and p.organisation_id = org;
  if existing is not null then
    return existing;
  end if;

  select s.load_id, s.status, l.status, s.site_id, si.customer_id
    into stop_load, stop_status, load_status, stop_site, stop_customer
    from public.load_stops s
    join public.loads l on l.id = s.load_id
    join public.sites si on si.id = s.site_id
   where s.id = target_stop and s.organisation_id = org
     for update of s, l;
  if stop_load is null then
    raise exception 'That stop is no longer on a load.' using errcode = 'P0002';
  end if;
  has_orders := exists (select 1 from public.stop_orders so where so.stop_id = target_stop);

  if not is_staff and not (
    private.has_role('driver') and exists (
      select 1 from public.load_drivers ld
        join public.drivers d on d.id = ld.driver_id
       where ld.load_id = stop_load and d.user_id = me and d.organisation_id = org
    )
  ) then
    raise exception 'You''re not a driver on this load.' using errcode = '42501', hint = 'not_on_load';
  end if;

  if load_status in ('draft', 'planned') then
    raise exception 'This load hasn''t been confirmed yet. Ask your planner.'
      using errcode = 'P0001', hint = 'load_not_confirmed';
  end if;
  if load_status = 'complete' and not is_staff then
    raise exception 'This load is complete. Ask your planner to change it.'
      using errcode = 'P0001', hint = 'load_complete';
  end if;
  if load_status = 'complete' and exists (
    select 1 from public.stop_assets sa where sa.stop_id = target_stop
  ) then
    raise exception 'Assets on this stop have already gone back to the depot. Correct them on the asset instead.'
      using errcode = 'P0001', hint = 'assets_settled';
  end if;

  if outcome not in ('delivered', 'part_delivered', 'failed') then
    raise exception 'Choose delivered, part delivered or failed.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(collected, '{}')) c(asset_id)
     where not exists (
       select 1 from public.stop_assets sa
        where sa.stop_id = target_stop and sa.asset_id = c.asset_id and sa.direction = 'collect'
     )
  ) then
    raise exception 'Only assets planned for collection here can be collected.' using errcode = '22023';
  end if;
  if outcome = 'failed' then
    if failure_reason is null then
      raise exception 'Choose why the delivery failed.' using errcode = '22023', hint = 'failure_reason';
    end if;
    if char_length(btrim(coalesce(note, ''))) < 2 then
      raise exception 'Add a note saying what happened.' using errcode = '22023', hint = 'note';
    end if;
  elsif has_orders then
    if char_length(btrim(coalesce(received_by, ''))) < 2 then
      raise exception 'Enter the name of the person who received it.' using errcode = '22023', hint = 'received_by';
    end if;
    if signature_path is null and not (no_signature and cardinality(photo_paths) > 0) then
      raise exception 'Get a signature, or take a photo if nobody can sign.' using errcode = '22023', hint = 'signature';
    end if;
  elsif coalesce(cardinality(collected), 0) = 0 then
    raise exception 'Tick what you collected, or record the collection as failed.'
      using errcode = '22023', hint = 'collected';
  end if;

  -- Files must be in this stop's folder and already uploaded.
  folder := org::text || '/pods/' || target_stop::text || '/';
  foreach file_path in array (coalesce(photo_paths, '{}') || case when signature_path is null then '{}'::text[] else array[signature_path] end)
  loop
    if file_path not like folder || '%' or file_path like '%..%' then
      raise exception 'A photo or signature is in the wrong place.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o where o.bucket_id = 'organisation-files' and o.name = file_path
    ) then
      raise exception 'A photo or signature hasn''t finished uploading.' using errcode = 'P0001', hint = 'file_missing';
    end if;
  end loop;

  -- Replace any earlier record for this stop (a correction).
  delete from public.pods p where p.stop_id = target_stop;

  insert into public.pods (
    organisation_id, stop_id, load_id, client_id, outcome, received_by, signature_path,
    no_signature, photo_paths, failure_reason, note, recorded_at, recorded_by,
    latitude, longitude, accuracy_m, collection_only
  ) values (
    org, target_stop, stop_load, record_pod.client_id, outcome,
    case when outcome = 'failed' then '' else btrim(coalesce(received_by, '')) end,
    case when outcome = 'failed' then null else signature_path end,
    outcome <> 'failed' and signature_path is null and no_signature,
    coalesce(photo_paths, '{}'),
    case when outcome = 'failed' then failure_reason end,
    btrim(coalesce(note, '')),
    when_recorded, me,
    latitude, longitude, accuracy_m, not has_orders
  ) returning id into pod;

  for line in
    select ol.id, ol.order_id, ol.quantity
      from public.stop_orders so
      join public.order_lines ol on ol.order_id = so.order_id
     where so.stop_id = target_stop
     order by ol.order_id, ol.position
  loop
    line_count := line_count + 1;
    select (l ->> 'quantity')::integer into wanted
      from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) l
     where (l ->> 'order_line_id')::uuid = line.id
     limit 1;
    wanted := case
      when outcome = 'failed' then 0
      when outcome = 'delivered' then line.quantity
      else coalesce(wanted, line.quantity)
    end;
    if wanted < 0 or wanted > line.quantity then
      raise exception 'Delivered quantities must be between 0 and the quantity ordered.'
        using errcode = '22023', hint = 'quantity';
    end if;
    if wanted < line.quantity then short_lines := short_lines + 1; end if;
    if wanted > 0 then some_delivered := true; end if;
    insert into public.pod_lines (organisation_id, pod_id, order_id, order_line_id, ordered_quantity, delivered_quantity)
    values (org, pod, line.order_id, line.id, line.quantity, wanted);
  end loop;

  if outcome = 'part_delivered' and line_count > 0 and (short_lines = 0 or not some_delivered) then
    raise exception 'For a part delivery, enter what was delivered: some, but not everything.'
      using errcode = '22023', hint = 'quantity';
  end if;

  update public.load_stops s set status = outcome where s.id = target_stop;

  -- The run has started (drops at the depot go on the vehicle).
  if load_status in ('confirmed', 'loading') then
    update public.loads l set status = 'out' where l.id = stop_load;
  end if;

  update public.orders o
     set status = case when outcome = 'failed' then 'failed' else 'delivered' end
    from public.stop_orders so
   where so.stop_id = target_stop and o.id = so.order_id;

  -- Assets at this stop. A correction first puts back anything an earlier record moved.
  perform set_config('app.asset_load', stop_load::text, true);
  perform set_config('app.asset_stop', target_stop::text, true);
  update public.assets a
     set status = 'on_vehicle', load_id = stop_load, site_id = null, customer_id = null,
         dropped_on = null, expected_return_date = null
    from public.stop_assets sa
   where sa.stop_id = target_stop and sa.asset_id = a.id and sa.direction = 'drop'
     and sa.outcome = 'done' and a.status = 'at_customer' and a.site_id = stop_site;
  update public.assets a
     set status = 'at_customer', site_id = stop_site, customer_id = stop_customer, load_id = null
    from public.stop_assets sa
   where sa.stop_id = target_stop and sa.asset_id = a.id and sa.direction = 'collect'
     and sa.outcome = 'done' and a.status = 'on_vehicle' and a.load_id = stop_load;
  update public.stop_assets sa set outcome = 'pending' where sa.stop_id = target_stop;

  drop_day := (when_recorded at time zone 'Europe/London')::date;
  if outcome <> 'failed' and has_orders then
    update public.assets a
       set status = 'at_customer', site_id = stop_site, customer_id = stop_customer,
           load_id = null, depot_id = null, dropped_on = drop_day,
           -- No return period on the unit type: no due date, so never overdue.
           expected_return_date = case when u.return_days is null then null
                                       else drop_day + u.return_days end
      from public.stop_assets sa, public.unit_types u
     where sa.stop_id = target_stop and sa.asset_id = a.id and sa.direction = 'drop'
       and u.id = a.unit_type_id and a.status = 'on_vehicle' and a.load_id = stop_load;
    update public.stop_assets sa set outcome = 'done'
     where sa.stop_id = target_stop and sa.direction = 'drop';
  end if;
  if outcome <> 'failed' then
    update public.assets a
       set status = 'on_vehicle', load_id = stop_load, site_id = null, customer_id = null,
           dropped_on = null, expected_return_date = null
      from public.stop_assets sa
     where sa.stop_id = target_stop and sa.asset_id = a.id and sa.direction = 'collect'
       and sa.asset_id = any (coalesce(collected, '{}')) and a.status = 'at_customer';
    update public.stop_assets sa set outcome = 'done'
     where sa.stop_id = target_stop and sa.direction = 'collect'
       and sa.asset_id = any (coalesce(collected, '{}'));
  end if;
  perform set_config('app.asset_stop', '', true);

  -- Every stop has an outcome: the run is complete (and assets on board go back to the depot).
  if not exists (
    select 1 from public.load_stops s where s.load_id = stop_load and s.status = 'pending'
  ) then
    update public.loads l set status = 'complete' where l.id = stop_load and l.status <> 'complete';
  end if;
  perform set_config('app.asset_load', '', true);

  return pod;
end;
$$;

revoke all on function public.record_pod(uuid, uuid, text, text, text, boolean, text[], text, text, jsonb, timestamptz, double precision, double precision, double precision, uuid[]) from public, anon;
grant execute on function public.record_pod(uuid, uuid, text, text, text, boolean, text[], text, text, jsonb, timestamptz, double precision, double precision, double precision, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Moving an asset by hand (found at a site, back at the depot, lost, retired)
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER: only planners and admins can update assets (RLS). Any plan
-- to send or collect it is cancelled, since it's no longer where that assumed.
create function public.move_asset(
  target_asset uuid,
  to_status text,
  target_depot uuid default null,
  target_site uuid default null,
  due_back date default null,
  note text default ''
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_status text;
  site_customer uuid;
begin
  if not private.has_role('admin', 'planner') then
    raise exception 'Only planners can move assets.' using errcode = '42501';
  end if;
  select a.status into current_status from public.assets a where a.id = target_asset for update;
  if current_status is null then
    raise exception 'That asset no longer exists.' using errcode = 'P0002';
  end if;
  if to_status not in ('at_depot', 'at_customer', 'lost', 'retired') then
    raise exception 'Choose where the asset is now.' using errcode = '22023';
  end if;
  if current_status = 'on_vehicle' then
    raise exception 'It''s on a vehicle; it moves when the driver records the stop or the load completes.'
      using errcode = 'P0001', hint = 'on_vehicle';
  end if;
  if to_status = 'at_depot' and target_depot is null then
    raise exception 'Choose the depot.' using errcode = '22023';
  end if;
  if to_status = 'at_customer' then
    select s.customer_id into site_customer from public.sites s where s.id = target_site;
    if site_customer is null then
      raise exception 'Choose the customer site.' using errcode = '22023';
    end if;
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;

  delete from public.stop_assets sa where sa.asset_id = target_asset and sa.outcome = 'pending';
  perform set_config('app.asset_note', btrim(coalesce(note, '')), true);
  update public.assets a
     set status = to_status,
         depot_id = case when to_status = 'at_depot' then target_depot end,
         site_id = case when to_status = 'at_customer' then target_site end,
         customer_id = case when to_status = 'at_customer' then site_customer end,
         load_id = null,
         dropped_on = case when to_status = 'at_customer'
                           then coalesce(case when a.site_id = target_site then a.dropped_on end,
                                         (now() at time zone 'Europe/London')::date) end,
         expected_return_date = case when to_status = 'at_customer' then due_back end
   where a.id = target_asset;
  perform set_config('app.asset_note', '', true);
end;
$$;

revoke all on function public.move_asset(uuid, text, uuid, uuid, date, text) from public, anon;
grant execute on function public.move_asset(uuid, text, uuid, uuid, date, text) to authenticated;
