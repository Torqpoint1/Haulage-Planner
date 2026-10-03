-- Stage 8: drivers. Proof of delivery per stop (spec 6.10, 9.8): who received
-- it, signature, photos, delivered quantity per order line, notes, time and
-- location. Failed deliveries need a reason from a fixed list and a note.
--
-- Drivers can't edit loads or stops, so the only write path is
-- public.record_pod(), which checks the caller is a driver on that load (or a
-- planner or admin) and sets the stop, order and load statuses to match.
-- Submissions from the phone's offline queue carry a client id, so sending the
-- same one twice records it once.

create table public.pods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  stop_id uuid not null unique,
  load_id uuid not null,
  client_id uuid not null,
  outcome text not null check (outcome in ('delivered', 'part_delivered', 'failed')),
  received_by text not null default '' check (char_length(received_by) <= 120),
  signature_path text,
  -- Nobody there to sign (left as instructed): needs a photo instead.
  no_signature boolean not null default false,
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 10),
  failure_reason text check (failure_reason in (
    'site_closed', 'no_one_to_receive', 'refused', 'no_access', 'wrong_address',
    'damaged', 'not_ready', 'out_of_time', 'vehicle_problem', 'other'
  )),
  -- Damage or shortage notes, or what happened on a failed delivery.
  note text not null default '' check (char_length(note) <= 2000),
  -- When the driver recorded it on the phone, which can be well before it reached us.
  recorded_at timestamptz not null,
  recorded_by uuid references auth.users (id) on delete set null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, client_id),
  check (outcome <> 'failed' or (failure_reason is not null and char_length(btrim(note)) >= 2)),
  check (outcome = 'failed' or char_length(btrim(received_by)) >= 2),
  check (outcome = 'failed' or signature_path is not null or (no_signature and cardinality(photo_paths) > 0)),
  check (signature_path is null or signature_path like organisation_id::text || '/pods/' || stop_id::text || '/%'),
  check ((latitude is null) = (longitude is null)),
  foreign key (stop_id, organisation_id) references public.load_stops (id, organisation_id) on delete cascade,
  foreign key (load_id, organisation_id) references public.loads (id, organisation_id) on delete cascade
);
create index pods_load_idx on public.pods (load_id);

select private.secure_org_table('public.pods', array['admin', 'planner']::public.app_role[]);

create table public.pod_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  pod_id uuid not null,
  order_id uuid not null,
  order_line_id uuid not null,
  ordered_quantity integer not null check (ordered_quantity >= 0),
  delivered_quantity integer not null check (delivered_quantity between 0 and ordered_quantity),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (pod_id, order_line_id),
  foreign key (pod_id, organisation_id) references public.pods (id, organisation_id) on delete cascade,
  foreign key (order_id, organisation_id) references public.orders (id, organisation_id) on delete cascade,
  foreign key (order_line_id, organisation_id) references public.order_lines (id, organisation_id) on delete cascade,
  foreign key (order_line_id, order_id) references public.order_lines (id, order_id) on delete cascade
);
create index pod_lines_pod_idx on public.pod_lines (pod_id);
create index pod_lines_order_idx on public.pod_lines (order_id);

select private.secure_org_table('public.pod_lines', array['admin', 'planner']::public.app_role[]);

-- ---------------------------------------------------------------------------
-- Recording a delivery
-- ---------------------------------------------------------------------------

-- lines: [{"order_line_id": "...", "quantity": 3}, ...]. Missing lines count as
-- delivered in full (or none on a failed delivery). Returns the POD id.
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
  accuracy_m double precision default null
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
  stop_status text;
  load_status text;
  is_staff boolean := private.has_role('admin', 'planner');
  folder text;
  file_path text;
  pod uuid;
  line record;
  wanted integer;
  short_lines integer := 0;
  some_delivered boolean := false;
  line_count integer := 0;
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

  select s.load_id, s.status, l.status into stop_load, stop_status, load_status
    from public.load_stops s
    join public.loads l on l.id = s.load_id
   where s.id = target_stop and s.organisation_id = org
     for update of s, l;
  if stop_load is null then
    raise exception 'That stop is no longer on a load.' using errcode = 'P0002';
  end if;

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

  if outcome not in ('delivered', 'part_delivered', 'failed') then
    raise exception 'Choose delivered, part delivered or failed.' using errcode = '22023';
  end if;
  if outcome = 'failed' then
    if failure_reason is null then
      raise exception 'Choose why the delivery failed.' using errcode = '22023', hint = 'failure_reason';
    end if;
    if char_length(btrim(coalesce(note, ''))) < 2 then
      raise exception 'Add a note saying what happened.' using errcode = '22023', hint = 'note';
    end if;
  else
    if char_length(btrim(coalesce(received_by, ''))) < 2 then
      raise exception 'Enter the name of the person who received it.' using errcode = '22023', hint = 'received_by';
    end if;
    if signature_path is null and not (no_signature and cardinality(photo_paths) > 0) then
      raise exception 'Get a signature, or take a photo if nobody can sign.' using errcode = '22023', hint = 'signature';
    end if;
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
    latitude, longitude, accuracy_m
  ) values (
    org, target_stop, stop_load, record_pod.client_id, outcome,
    case when outcome = 'failed' then '' else btrim(received_by) end,
    case when outcome = 'failed' then null else signature_path end,
    outcome <> 'failed' and signature_path is null and no_signature,
    coalesce(photo_paths, '{}'),
    case when outcome = 'failed' then failure_reason end,
    btrim(coalesce(note, '')),
    least(coalesce(recorded_at, now()), now()), me,
    latitude, longitude, accuracy_m
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

  -- The run has started.
  if load_status in ('confirmed', 'loading') then
    update public.loads l set status = 'out' where l.id = stop_load;
  end if;

  update public.orders o
     set status = case when outcome = 'failed' then 'failed' else 'delivered' end
    from public.stop_orders so
   where so.stop_id = target_stop and o.id = so.order_id;

  -- Every stop has an outcome: the run is complete.
  if not exists (
    select 1 from public.load_stops s where s.load_id = stop_load and s.status = 'pending'
  ) then
    update public.loads l set status = 'complete' where l.id = stop_load and l.status <> 'complete';
  end if;

  return pod;
end;
$$;

revoke all on function public.record_pod(uuid, uuid, text, text, text, boolean, text[], text, text, jsonb, timestamptz, double precision, double precision, double precision) from public, anon;
grant execute on function public.record_pod(uuid, uuid, text, text, text, boolean, text[], text, text, jsonb, timestamptz, double precision, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Re-planning a failed delivery
-- ---------------------------------------------------------------------------

-- Takes a failed order off its finished load so it can be planned again. The
-- POD (with the reason) stays on the stop as a record of the attempt.
create function public.replan_failed_order(target_order uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
begin
  if not private.has_role('admin', 'planner') then
    raise exception 'Only planners can re-plan deliveries.' using errcode = '42501';
  end if;
  select o.status into current_status from public.orders o where o.id = target_order for update;
  if current_status is null then
    raise exception 'That order no longer exists.' using errcode = 'P0002';
  end if;
  if current_status <> 'failed' then
    raise exception 'Only failed deliveries can be put back to plan.' using errcode = 'P0001';
  end if;
  delete from public.stop_orders so where so.order_id = target_order;
  update public.orders o set status = 'unplanned' where o.id = target_order;
end;
$$;

revoke all on function public.replan_failed_order(uuid) from public, anon;
grant execute on function public.replan_failed_order(uuid) to authenticated;
