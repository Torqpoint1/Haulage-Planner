-- Stage 9: history search (spec 9.6). One search across loads and what was on
-- them: customer, site, dates, order ref, PO, delivery note, vehicle, driver,
-- haulier. SECURITY INVOKER, so RLS keeps it to the caller's organisation.

create index loads_org_date_desc_idx on public.loads (organisation_id, load_date desc);

create function public.search_history(
  q text default null,
  target_customer uuid default null,
  target_site uuid default null,
  date_from date default null,
  date_to date default null,
  target_vehicle uuid default null,
  target_driver uuid default null,
  target_haulier uuid default null,
  max_rows integer default 500
)
returns table (order_id uuid, stop_id uuid, load_id uuid, load_date date)
language sql
stable
set search_path = ''
as $$
  with needle as (
    select nullif(lower(btrim(coalesce(q, ''))), '') as t
  )
  select o.id, s.id, l.id, l.load_date
    from public.orders o
    join public.stop_orders so on so.order_id = o.id
    join public.load_stops s on s.id = so.stop_id
    join public.loads l on l.id = s.load_id
    join public.sites si on si.id = s.site_id
    left join public.vehicles v on v.id = l.vehicle_id
    left join public.hauliers h on h.id = l.haulier_id
    cross join needle n
   where (target_customer is null or o.customer_id = target_customer)
     and (target_site is null or o.site_id = target_site)
     and (date_from is null or l.load_date >= date_from)
     and (date_to is null or l.load_date <= date_to)
     and (target_vehicle is null or l.vehicle_id = target_vehicle)
     and (target_haulier is null or l.haulier_id = target_haulier)
     and (target_driver is null or exists (
           select 1 from public.load_drivers ld where ld.load_id = l.id and ld.driver_id = target_driver))
     and (
       n.t is null
       or o.search_text like '%' || n.t || '%'
       or lower(si.name) like '%' || n.t || '%'
       or lower(coalesce(v.name, '') || ' ' || coalesce(v.registration, '')) like '%' || n.t || '%'
       or lower(coalesce(h.name, '')) like '%' || n.t || '%'
       or exists (
            select 1 from public.load_drivers ld join public.drivers d on d.id = ld.driver_id
             where ld.load_id = l.id and lower(d.name) like '%' || n.t || '%')
     )
   order by l.load_date desc, l.id, s.sequence, o.order_ref
   limit least(greatest(coalesce(max_rows, 500), 1), 1000);
$$;

revoke all on function public.search_history(text, uuid, uuid, date, date, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.search_history(text, uuid, uuid, date, date, uuid, uuid, uuid, integer) to authenticated;
