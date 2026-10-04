-- Stage 10: reports (spec 14, stage 10). What a haulier agreed to charge for a
-- load; reports use it when set, otherwise the rate card price (an estimate).

alter table public.loads
  add column agreed_price numeric(10, 2) check (agreed_price between 0 and 100000);
alter table public.loads
  add constraint loads_agreed_price_haulier check (agreed_price is null or haulier_id is not null);

create index loads_status_date_idx on public.loads (organisation_id, status, load_date);
