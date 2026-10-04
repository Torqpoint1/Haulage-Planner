-- Data protection (spec 12, UK GDPR): an organisation's admins can ask for the
-- organisation and all its data to be deleted. The request is recorded here and
-- carried out by the service operator after 30 days; until then an admin can
-- cancel it. Nothing is deleted by the app itself.

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default private.current_org_id()
    references public.organisations (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 2000),
  status text not null default 'requested' check (status in ('requested', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint deletion_requests_cancelled check ((status = 'cancelled') = (cancelled_at is not null))
);
-- One open request at a time.
create unique index deletion_requests_open_key on public.deletion_requests (organisation_id)
  where status = 'requested';

select private.secure_org_table('public.deletion_requests', array['admin']::public.app_role[]);
-- Only admins see requests; nobody deletes them (they're the record).
drop policy "Members read" on public.deletion_requests;
create policy "Admins read" on public.deletion_requests for select to authenticated
  using (
    organisation_id = (select private.current_org_id())
    and (select private.has_role(variadic array['admin']::public.app_role[]))
  );
drop policy "Editors delete" on public.deletion_requests;
revoke delete on public.deletion_requests from authenticated;
