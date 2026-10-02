-- Stage 4: orders, lines, documents (spec 6.7), quote requests (6.5) and CSV import mappings (11).

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  customer_id uuid not null,
  site_id uuid not null,
  order_ref text not null check (char_length(btrim(order_ref)) between 1 and 40),
  customer_po text not null default '' check (char_length(customer_po) <= 60),
  delivery_note_number text not null default '' check (char_length(delivery_note_number) <= 60),
  invoice_number text not null default '' check (char_length(invoice_number) <= 60),
  required_date date not null,
  earliest_date date,
  latest_date date,
  urgency text not null default 'standard' check (urgency in ('standard', 'timed', 'critical')),
  readiness text not null default 'not_started'
    check (readiness in ('not_started', 'in_production', 'part_ready', 'ready')),
  missing_items text not null default '' check (char_length(missing_items) <= 1000),
  expected_ready_date date,
  status text not null default 'unplanned' check (status in
    ('unplanned', 'planned', 'loaded', 'out_for_delivery', 'delivered', 'failed', 'cancelled')),
  delivery_instructions text not null default '' check (char_length(delivery_instructions) <= 2000),
  notes text not null default '' check (char_length(notes) <= 4000),
  -- Lower-cased refs, customer name and site postcode, kept up to date by triggers,
  -- so one search box finds an order by any reference (spec 9.3, Stage 4).
  search_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  foreign key (customer_id, organisation_id) references public.customers (id, organisation_id) on delete restrict,
  -- The site must belong to the order's customer.
  foreign key (site_id, customer_id) references public.sites (id, customer_id) on delete restrict,
  check (earliest_date is null or earliest_date <= required_date),
  check (latest_date is null or latest_date >= required_date)
);
create unique index orders_ref_key on public.orders (organisation_id, lower(order_ref));
create index orders_required_idx on public.orders (organisation_id, required_date);
create index orders_status_idx on public.orders (organisation_id, status);
create index orders_customer_idx on public.orders (customer_id);
create index orders_site_idx on public.orders (site_id);
create index orders_search_idx on public.orders using gin (search_text extensions.gin_trgm_ops);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  order_id uuid not null,
  unit_type_id uuid not null,
  quantity integer not null check (quantity between 1 and 10000),
  weight_per_unit_kg numeric(10, 1) not null check (weight_per_unit_kg between 0 and 50000),
  description text not null default '' check (char_length(description) <= 500),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (order_id, organisation_id) references public.orders (id, organisation_id) on delete cascade,
  foreign key (unit_type_id, organisation_id) references public.unit_types (id, organisation_id) on delete restrict
);
create index order_lines_order_idx on public.order_lines (order_id);
create index order_lines_unit_type_idx on public.order_lines (unit_type_id);

-- Documents live in storage under "<organisation_id>/orders/<order_id>/…".
create table public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  order_id uuid not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null check (content_type in
    ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic')),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (order_id, organisation_id) references public.orders (id, organisation_id) on delete cascade,
  check (storage_path like organisation_id::text || '/orders/' || order_id::text || '/%')
);
create index order_attachments_order_idx on public.order_attachments (order_id);

-- ---------------------------------------------------------------------------
-- Quote requests (spec 6.5: marketplace-ready, not used in v1)
-- ---------------------------------------------------------------------------

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  haulier_id uuid not null,
  sent_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'sent', 'quoted', 'accepted', 'declined', 'expired')),
  quoted_price numeric(10, 2) check (quoted_price >= 0),
  response_notes text not null default '' check (char_length(response_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (id, organisation_id),
  foreign key (haulier_id, organisation_id) references public.hauliers (id, organisation_id) on delete cascade
);

create table public.quote_request_orders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  quote_request_id uuid not null,
  order_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (quote_request_id, order_id),
  foreign key (quote_request_id, organisation_id) references public.quote_requests (id, organisation_id) on delete cascade,
  foreign key (order_id, organisation_id) references public.orders (id, organisation_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- CSV import column mappings, remembered per organisation (spec 11)
-- ---------------------------------------------------------------------------

create table public.csv_import_mappings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  import_type text not null check (import_type in ('orders', 'customers', 'vehicles')),
  -- {"order_ref": "Order No", "required_date": "Delivery Date", ...}
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (organisation_id, import_type)
);

-- ---------------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------------

select private.secure_org_table('public.orders', array['admin', 'planner']::public.app_role[]);
select private.secure_org_table('public.order_lines', array['admin', 'planner']::public.app_role[]);
select private.secure_org_table('public.order_attachments', array['admin', 'planner']::public.app_role[]);
select private.secure_org_table('public.quote_requests', array['admin', 'planner']::public.app_role[]);
select private.secure_org_table('public.quote_request_orders', array['admin', 'planner']::public.app_role[]);
select private.secure_org_table('public.csv_import_mappings', array['admin', 'planner']::public.app_role[]);
drop trigger audit on public.csv_import_mappings;

-- Order history (spec 9.3 "history of changes"; 6.14) is readable by every member,
-- not just admins, for orders and their lines and documents.
create policy "Members read order history" on public.audit_log
  for select to authenticated
  using (
    organisation_id = (select private.current_org_id())
    and table_name in ('orders', 'order_lines', 'order_attachments')
  );

-- ---------------------------------------------------------------------------
-- Search text
-- ---------------------------------------------------------------------------

create function private.order_search_text(o public.orders)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(concat_ws(' ',
    o.order_ref, o.customer_po, o.delivery_note_number, o.invoice_number,
    c.name, c.account_ref, s.name, s.postcode, replace(s.postcode, ' ', '')))
  from public.customers c, public.sites s
  where c.id = o.customer_id and s.id = o.site_id;
$$;

create function private.orders_set_search()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := coalesce(private.order_search_text(new), '');
  return new;
end;
$$;

create trigger orders_search before insert or update on public.orders
  for each row execute function private.orders_set_search();

-- Renaming a customer or changing a site's postcode keeps order search right.
create function private.refresh_order_search()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'customers' then
    update public.orders o set search_text = coalesce(private.order_search_text(o), '')
     where o.customer_id = new.id;
  else
    update public.orders o set search_text = coalesce(private.order_search_text(o), '')
     where o.site_id = new.id;
  end if;
  return null;
end;
$$;

create trigger customers_refresh_order_search after update of name, account_ref on public.customers
  for each row execute function private.refresh_order_search();
create trigger sites_refresh_order_search after update of name, postcode on public.sites
  for each row execute function private.refresh_order_search();

-- ---------------------------------------------------------------------------
-- Saving an order with its lines, and importing many, in one transaction (RLS applies).
-- ---------------------------------------------------------------------------

create function public.save_order(target_order_id uuid, order_data jsonb, lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if target_order_id is null then
    insert into public.orders (
      customer_id, site_id, order_ref, customer_po, delivery_note_number, invoice_number,
      required_date, earliest_date, latest_date, urgency, readiness, missing_items,
      expected_ready_date, delivery_instructions, notes)
    select customer_id, site_id, order_ref, coalesce(customer_po, ''),
      coalesce(delivery_note_number, ''), coalesce(invoice_number, ''),
      required_date, earliest_date, latest_date, coalesce(urgency, 'standard'),
      coalesce(readiness, 'not_started'), coalesce(missing_items, ''),
      expected_ready_date, coalesce(delivery_instructions, ''), coalesce(notes, '')
    from jsonb_populate_record(null::public.orders, order_data)
    returning id into saved_id;
  else
    update public.orders o set
      customer_id = d.customer_id, site_id = d.site_id, order_ref = d.order_ref,
      customer_po = coalesce(d.customer_po, ''),
      delivery_note_number = coalesce(d.delivery_note_number, ''),
      invoice_number = coalesce(d.invoice_number, ''), required_date = d.required_date,
      earliest_date = d.earliest_date, latest_date = d.latest_date,
      urgency = coalesce(d.urgency, 'standard'), readiness = coalesce(d.readiness, 'not_started'),
      missing_items = coalesce(d.missing_items, ''), expected_ready_date = d.expected_ready_date,
      delivery_instructions = coalesce(d.delivery_instructions, ''), notes = coalesce(d.notes, '')
    from jsonb_populate_record(null::public.orders, order_data) d
    where o.id = target_order_id
    returning o.id into saved_id;
    if saved_id is null then
      raise exception 'Order not found.' using errcode = 'P0002';
    end if;
    delete from public.order_lines where order_id = saved_id;
  end if;

  insert into public.order_lines (order_id, unit_type_id, quantity, weight_per_unit_kg, description, position)
  select saved_id, (l ->> 'unit_type_id')::uuid, (l ->> 'quantity')::integer,
         (l ->> 'weight_per_unit_kg')::numeric, coalesce(l ->> 'description', ''), (ord - 1)::smallint
  from jsonb_array_elements(lines) with ordinality as t(l, ord);

  return saved_id;
end;
$$;

-- Import validated orders: [{ "order": {...}, "lines": [...] }, ...]. All or nothing.
create function public.import_orders(orders jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  imported integer := 0;
begin
  for item in select * from jsonb_array_elements(orders) loop
    perform public.save_order(null, item -> 'order', item -> 'lines');
    imported := imported + 1;
  end loop;
  return imported;
end;
$$;

revoke all on function public.save_order(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.import_orders(jsonb) from public, anon;
grant execute on function public.save_order(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.import_orders(jsonb) to authenticated;

-- The audit log ignores internal search text (only real changes are history).
create or replace function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'search_text' end;
  after_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'search_text' end;
  row_data jsonb := coalesce(after_row, before_row);
  org uuid;
begin
  org := case
    when tg_table_name = 'organisations' then (row_data ->> 'id')::uuid
    else (row_data ->> 'organisation_id')::uuid
  end;

  if tg_op = 'UPDATE' and (before_row - 'updated_at') = (after_row - 'updated_at') then
    return null;
  end if;

  if not exists (select 1 from public.organisations o where o.id = org) then
    return null;
  end if;

  before_row := before_row - 'token_hash';
  after_row := after_row - 'token_hash';

  insert into public.audit_log (organisation_id, table_name, record_id, action, actor_id, before, after)
  values (org, tg_table_name, (row_data ->> 'id')::uuid, lower(tg_op), auth.uid(), before_row, after_row);

  return null;
end;
$$;
