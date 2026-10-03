-- Stage 7: warehouse pick sheets (spec 9.5). Progress is kept per order line
-- while its order is on a load; taking the order off the load clears it.

alter table public.order_lines add constraint order_lines_id_org_key unique (id, organisation_id);
alter table public.order_lines add constraint order_lines_id_order_key unique (id, order_id);
alter table public.stop_orders add constraint stop_orders_id_org_key unique (id, organisation_id);
alter table public.stop_orders add constraint stop_orders_id_order_key unique (id, order_id);

create table public.pick_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  stop_order_id uuid not null,
  order_id uuid not null,
  order_line_id uuid not null unique,
  picked boolean not null default false,
  picked_at timestamptz,
  picked_by uuid references auth.users (id) on delete set null,
  loaded boolean not null default false,
  loaded_at timestamptz,
  loaded_by uuid references auth.users (id) on delete set null,
  shortage boolean not null default false,
  shortage_note text not null default '' check (char_length(shortage_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- A shortage needs saying what's short.
  check (not shortage or char_length(btrim(shortage_note)) >= 2),
  foreign key (stop_order_id, organisation_id) references public.stop_orders (id, organisation_id) on delete cascade,
  foreign key (order_line_id, organisation_id) references public.order_lines (id, organisation_id) on delete cascade,
  -- The line must belong to the order that's on the stop.
  foreign key (stop_order_id, order_id) references public.stop_orders (id, order_id) on delete cascade,
  foreign key (order_line_id, order_id) references public.order_lines (id, order_id) on delete cascade
);
create index pick_lines_stop_order_idx on public.pick_lines (stop_order_id);

-- Pickers and loaders tick lines (spec 3); planners and admins can too.
select private.secure_org_table('public.pick_lines', array['admin', 'planner', 'warehouse']::public.app_role[]);

-- Tick a line as picked or loaded, or flag a shortage. Arguments left null are
-- unchanged. Records who did it and when.
create function public.tick_line(
  target_line uuid,
  set_picked boolean default null,
  set_loaded boolean default null,
  set_shortage boolean default null,
  note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  line_order uuid;
  stop_link uuid;
  load_status text;
begin
  select ol.order_id into line_order from public.order_lines ol where ol.id = target_line;
  if line_order is null then
    raise exception 'That line no longer exists.' using errcode = 'P0002';
  end if;
  select so.id, l.status into stop_link, load_status
    from public.stop_orders so
    join public.load_stops s on s.id = so.stop_id
    join public.loads l on l.id = s.load_id
   where so.order_id = line_order;
  if stop_link is null then
    raise exception 'That order is no longer on a load.' using errcode = 'P0002';
  end if;
  if load_status in ('out', 'complete') then
    raise exception 'This load has already left.' using errcode = 'P0001', hint = 'load_left';
  end if;

  insert into public.pick_lines (stop_order_id, order_id, order_line_id)
  values (stop_link, line_order, target_line)
  on conflict (order_line_id) do nothing;

  update public.pick_lines p
     set picked = coalesce(set_picked, p.picked),
         picked_at = case when set_picked is true and not p.picked then now()
                          when set_picked is false then null else p.picked_at end,
         picked_by = case when set_picked is true and not p.picked then auth.uid()
                          when set_picked is false then null else p.picked_by end,
         loaded = coalesce(set_loaded, p.loaded),
         loaded_at = case when set_loaded is true and not p.loaded then now()
                          when set_loaded is false then null else p.loaded_at end,
         loaded_by = case when set_loaded is true and not p.loaded then auth.uid()
                          when set_loaded is false then null else p.loaded_by end,
         shortage = coalesce(set_shortage, p.shortage),
         shortage_note = case when set_shortage is false then ''
                              when note is not null then btrim(note) else p.shortage_note end
   where p.order_line_id = target_line;
end;
$$;

revoke all on function public.tick_line(uuid, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.tick_line(uuid, boolean, boolean, boolean, text) to authenticated;
