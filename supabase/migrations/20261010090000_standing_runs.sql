-- Stage 9: standing runs (spec 6.12). Routine routes, e.g. a parts supplier's
-- Tuesday and Thursday run. Each run day gets a draft load, created when the
-- plan for that week is opened; orders for the run's sites received before the
-- cut-off are suggested onto it. Nothing is added without a click.

create table public.standing_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  days text[] not null default '{}'
    check (cardinality(days) > 0 and private.all_in(days, array['mon','tue','wed','thu','fri','sat','sun'])),
  -- Orders received by this time on the run day are suggested for that day's load.
  cutoff_time time not null default '12:00',
  start_time time not null default '07:30',
  depot_id uuid not null,
  vehicle_id uuid,
  driver_id uuid,
  active boolean not null default true,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  foreign key (depot_id, organisation_id) references public.depots (id, organisation_id) on delete restrict,
  foreign key (vehicle_id, organisation_id) references public.vehicles (id, organisation_id) on delete restrict,
  foreign key (driver_id, organisation_id) references public.drivers (id, organisation_id) on delete restrict
);
create unique index standing_runs_name_key on public.standing_runs (organisation_id, lower(btrim(name)));
create index standing_runs_depot_idx on public.standing_runs (depot_id);
create index standing_runs_vehicle_idx on public.standing_runs (vehicle_id);
create index standing_runs_driver_idx on public.standing_runs (driver_id);

select private.secure_settings_table('public.standing_runs');

-- The regular sites, in their usual drop order.
create table public.standing_run_sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  run_id uuid not null,
  site_id uuid not null,
  position smallint not null check (position between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (run_id, site_id),
  foreign key (run_id, organisation_id) references public.standing_runs (id, organisation_id) on delete cascade,
  foreign key (site_id, organisation_id) references public.sites (id, organisation_id) on delete cascade
);
create index standing_run_sites_site_idx on public.standing_run_sites (site_id);

select private.secure_settings_table('public.standing_run_sites');

-- Save a run and its sites in one go (SECURITY INVOKER: admins only, by RLS).
create function public.save_standing_run(target_id uuid, run jsonb, site_ids uuid[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  saved uuid := target_id;
begin
  if coalesce(cardinality(site_ids), 0) = 0 then
    raise exception 'Add at least one site.' using errcode = '22023', hint = 'site_ids';
  end if;
  if saved is null then
    insert into public.standing_runs (name, days, cutoff_time, start_time, depot_id, vehicle_id, driver_id, active, notes)
    values (
      run ->> 'name',
      array(select jsonb_array_elements_text(run -> 'days')),
      (run ->> 'cutoff_time')::time,
      (run ->> 'start_time')::time,
      (run ->> 'depot_id')::uuid,
      nullif(run ->> 'vehicle_id', '')::uuid,
      nullif(run ->> 'driver_id', '')::uuid,
      coalesce((run ->> 'active')::boolean, true),
      coalesce(run ->> 'notes', '')
    )
    returning id into saved;
  else
    update public.standing_runs set
      name = run ->> 'name',
      days = array(select jsonb_array_elements_text(run -> 'days')),
      cutoff_time = (run ->> 'cutoff_time')::time,
      start_time = (run ->> 'start_time')::time,
      depot_id = (run ->> 'depot_id')::uuid,
      vehicle_id = nullif(run ->> 'vehicle_id', '')::uuid,
      driver_id = nullif(run ->> 'driver_id', '')::uuid,
      active = coalesce((run ->> 'active')::boolean, true),
      notes = coalesce(run ->> 'notes', '')
    where id = saved;
    if not found then
      raise exception 'That standing run no longer exists.' using errcode = 'P0002';
    end if;
    delete from public.standing_run_sites rs where rs.run_id = saved;
  end if;
  insert into public.standing_run_sites (run_id, site_id, position)
  select saved, s.site_id, s.n
    from unnest(site_ids) with ordinality as s(site_id, n);
  return saved;
end;
$$;

revoke all on function public.save_standing_run(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.save_standing_run(uuid, jsonb, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- The draft load for each run day
-- ---------------------------------------------------------------------------

alter table public.loads add column standing_run_id uuid;
alter table public.loads
  add constraint loads_standing_run_fkey foreign key (standing_run_id, organisation_id)
  references public.standing_runs (id, organisation_id) on delete set null (standing_run_id);
create index loads_standing_run_idx on public.loads (standing_run_id);

-- Days already generated, so a draft load the planner deletes doesn't come back.
create table public.standing_run_days (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  run_id uuid not null,
  run_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (run_id, run_date),
  foreign key (run_id, organisation_id) references public.standing_runs (id, organisation_id) on delete cascade
);

select private.secure_org_table('public.standing_run_days', array['admin', 'planner']::public.app_role[]);
drop trigger audit on public.standing_run_days;

-- Create any missing draft loads for run days from today (London) to `to_date`.
-- Planners and admins only; for anyone else it does nothing. Returns how many.
create function public.generate_standing_loads(from_date date, to_date date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/London')::date;
  d date;
  r record;
  new_load uuid;
  made integer := 0;
begin
  if not private.has_role('admin', 'planner') then
    return 0;
  end if;
  if to_date - from_date > 62 then
    raise exception 'Generate up to two months at a time.' using errcode = '22023';
  end if;
  for r in select * from public.standing_runs where active loop
    d := greatest(from_date, today);
    while d <= to_date loop
      if lower(to_char(d, 'Dy')) = any (r.days) then
        insert into public.standing_run_days (run_id, run_date) values (r.id, d)
        on conflict (run_id, run_date) do nothing;
        if found then
          insert into public.loads (load_date, depot_id, vehicle_id, start_time, standing_run_id, notes)
          values (d, r.depot_id, r.vehicle_id, r.start_time, r.id, r.notes)
          returning id into new_load;
          if r.driver_id is not null then
            insert into public.load_drivers (load_id, driver_id) values (new_load, r.driver_id);
          end if;
          made := made + 1;
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return made;
end;
$$;

revoke all on function public.generate_standing_loads(date, date) from public, anon;
grant execute on function public.generate_standing_loads(date, date) to authenticated;
