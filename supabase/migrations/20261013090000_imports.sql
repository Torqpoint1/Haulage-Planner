-- CSV imports for customers/sites and vehicles (spec 11). Validated on the
-- server first; each batch is all or nothing. SECURITY INVOKER, so RLS decides
-- who may import (planners and admins for customers, admins for vehicles).

-- [{ "existing_id": uuid|null, "name", "account_ref", "sites": [{ name, address,
--   postcode, latitude, longitude, delivery_instructions, booking_required,
--   site_equipment[], contact: { name, phone, email } | null }] }]
create function public.import_customers(customers jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  site jsonb;
  customer uuid;
  new_site uuid;
  imported integer := 0;
begin
  for item in select * from jsonb_array_elements(customers) loop
    customer := nullif(item ->> 'existing_id', '')::uuid;
    if customer is null then
      insert into public.customers (name, account_ref)
      values (btrim(item ->> 'name'), coalesce(btrim(item ->> 'account_ref'), ''))
      returning id into customer;
    elsif not exists (select 1 from public.customers c where c.id = customer) then
      raise exception 'A customer in this file has been deleted. Check the file and try again.'
        using errcode = 'P0002';
    end if;
    for site in select * from jsonb_array_elements(item -> 'sites') loop
      insert into public.sites (
        customer_id, name, address, postcode, latitude, longitude, location_source,
        delivery_instructions, booking_required, site_equipment
      ) values (
        customer,
        btrim(site ->> 'name'),
        coalesce(site ->> 'address', ''),
        site ->> 'postcode',
        (site ->> 'latitude')::double precision,
        (site ->> 'longitude')::double precision,
        case when site ->> 'latitude' is not null then 'postcode' end,
        coalesce(site ->> 'delivery_instructions', ''),
        coalesce((site ->> 'booking_required')::boolean, false),
        coalesce(array(select jsonb_array_elements_text(site -> 'site_equipment')), '{}')
      ) returning id into new_site;
      if jsonb_typeof(site -> 'contact') = 'object' then
        insert into public.contacts (customer_id, site_id, name, phone, email)
        values (
          customer, new_site, btrim(site -> 'contact' ->> 'name'),
          coalesce(site -> 'contact' ->> 'phone', ''), coalesce(site -> 'contact' ->> 'email', '')
        );
      end if;
      imported := imported + 1;
    end loop;
  end loop;
  return imported;
end;
$$;

revoke all on function public.import_customers(jsonb) from public, anon;
grant execute on function public.import_customers(jsonb) to authenticated;
