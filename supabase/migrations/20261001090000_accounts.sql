-- Stage 1: organisations, users, roles, invitations and the audit log.
--
-- Isolation model (spec section 5):
--   * Every business table carries organisation_id and has Row Level Security.
--   * A user belongs to exactly one organisation in v1 (memberships.user_id is unique).
--   * Policies resolve "my organisation" and "my role" through SECURITY DEFINER helpers in the
--     `private` schema, which PostgREST does not expose.
--   * Writes that need extra checks (creating an organisation, invitations) go through
--     SECURITY DEFINER functions instead of direct table grants.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.app_role as enum ('admin', 'planner', 'warehouse', 'driver', 'office');

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  logo_path text,
  accent_colour text not null default '#1d4ed8' check (accent_colour ~ '^#[0-9a-fA-F]{6}$'),
  timezone text not null default 'Europe/London',
  site_info_stale_days integer not null default 180 check (site_info_stale_days between 1 and 3650),
  warning_thresholds jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table public.organisations is
  'A customer company. Its id is the organisation_id on every business table.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Display details for a user. Visible only to the user and members of their organisation.';

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index memberships_organisation_id_idx on public.memberships (organisation_id);

-- Lets the API join a member to their name and email (profiles share the user's id).
alter table public.memberships
  add constraint memberships_user_profile_fkey foreign key (user_id)
  references public.profiles (id) on delete cascade;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.app_role not null,
  -- Only a SHA-256 hash is stored; the token itself is shown once to the admin.
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index invitations_organisation_id_idx on public.invitations (organisation_id);
create unique index invitations_one_open_per_email
  on public.invitations (organisation_id, email)
  where accepted_at is null and revoked_at is null;

-- Spec 6.14: who, when, what changed (before/after). Append-only.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_organisation_created_idx on public.audit_log (organisation_id, created_at desc);
create index audit_log_record_idx on public.audit_log (record_id);

create trigger organisations_touch before update on public.organisations
  for each row execute function private.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on public.memberships
  for each row execute function private.touch_updated_at();
create trigger invitations_touch before update on public.invitations
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers used by policies (SECURITY DEFINER avoids recursive RLS on memberships)
-- ---------------------------------------------------------------------------

create function private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organisation_id from public.memberships m where m.user_id = (select auth.uid());
$$;

create function private.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.memberships m where m.user_id = (select auth.uid());
$$;

create function private.has_role(variadic roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.role = any (roles) from public.memberships m where m.user_id = (select auth.uid())),
    false
  );
$$;

revoke all on function private.current_org_id() from public;
revoke all on function private.my_role() from public;
revoke all on function private.has_role(public.app_role[]) from public;
grant execute on function private.current_org_id() to authenticated;
grant execute on function private.my_role() to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit trigger (6.14)
-- ---------------------------------------------------------------------------

create function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  after_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  row_data jsonb := coalesce(after_row, before_row);
  org uuid;
begin
  org := case
    when tg_table_name = 'organisations' then (row_data ->> 'id')::uuid
    else (row_data ->> 'organisation_id')::uuid
  end;

  -- Nothing meaningful changed.
  if tg_op = 'UPDATE' and (before_row - 'updated_at') = (after_row - 'updated_at') then
    return null;
  end if;

  -- The organisation itself is being deleted (cascade): its history goes with it.
  if not exists (select 1 from public.organisations o where o.id = org) then
    return null;
  end if;

  -- Never copy secrets into the log.
  before_row := before_row - 'token_hash';
  after_row := after_row - 'token_hash';

  insert into public.audit_log (organisation_id, table_name, record_id, action, actor_id, before, after)
  values (org, tg_table_name, (row_data ->> 'id')::uuid, lower(tg_op), auth.uid(), before_row, after_row);

  return null;
end;
$$;

create trigger organisations_audit after insert or update or delete on public.organisations
  for each row execute function private.audit();
create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.audit();
create trigger invitations_audit after insert or update or delete on public.invitations
  for each row execute function private.audit();

-- ---------------------------------------------------------------------------
-- Profiles follow auth.users
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    lower(coalesce(new.email, ''))
  );
  return new;
end;
$$;

create function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Keep at least one admin in every organisation
-- ---------------------------------------------------------------------------

create function private.keep_an_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' then
    return new;
  end if;
  -- Allowed when the whole organisation is being deleted.
  if not exists (select 1 from public.organisations o where o.id = old.organisation_id) then
    return coalesce(new, old);
  end if;
  -- Serialise concurrent changes for this organisation.
  perform 1 from public.organisations o where o.id = old.organisation_id for update;
  if not exists (
    select 1 from public.memberships m
    where m.organisation_id = old.organisation_id and m.role = 'admin' and m.id <> old.id
  ) then
    raise exception 'An organisation must keep at least one admin.'
      using errcode = 'P0001', hint = 'last_admin';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_admin before update of role or delete on public.memberships
  for each row execute function private.keep_an_admin();

-- Memberships never move between organisations or users.
create function private.memberships_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organisation_id <> old.organisation_id or new.user_id <> old.user_id then
    raise exception 'Memberships cannot be moved.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger memberships_immutable before update on public.memberships
  for each row execute function private.memberships_immutable();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

-- Start from nothing, then grant only what each role of client needs.
revoke all on public.organisations, public.profiles, public.memberships, public.invitations,
  public.audit_log from anon, authenticated;

grant select on public.organisations to authenticated;
grant update (name, logo_path, accent_colour, timezone, site_info_stale_days, warning_thresholds)
  on public.organisations to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
grant select on public.invitations to authenticated;
grant select on public.audit_log to authenticated;

create policy "Members read their organisation" on public.organisations
  for select to authenticated
  using (id = (select private.current_org_id()));

create policy "Admins update their organisation" on public.organisations
  for update to authenticated
  using (id = (select private.current_org_id()) and (select private.has_role('admin')))
  with check (id = (select private.current_org_id()));

create policy "Users read themselves and colleagues" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.memberships m
      where m.organisation_id = (select private.current_org_id())
    )
  );

create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Members read their organisation's memberships" on public.memberships
  for select to authenticated
  using (organisation_id = (select private.current_org_id()));

create policy "Admins change roles" on public.memberships
  for update to authenticated
  using (organisation_id = (select private.current_org_id()) and (select private.has_role('admin')))
  with check (organisation_id = (select private.current_org_id()));

create policy "Admins remove members" on public.memberships
  for delete to authenticated
  using (organisation_id = (select private.current_org_id()) and (select private.has_role('admin')));

create policy "Admins read invitations" on public.invitations
  for select to authenticated
  using (organisation_id = (select private.current_org_id()) and (select private.has_role('admin')));

create policy "Admins read the audit log" on public.audit_log
  for select to authenticated
  using (organisation_id = (select private.current_org_id()) and (select private.has_role('admin')));

-- ---------------------------------------------------------------------------
-- API functions
-- ---------------------------------------------------------------------------

-- Create an organisation and make the caller its first admin.
create function public.create_organisation(organisation_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  org_id uuid;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships m where m.user_id = uid) then
    raise exception 'You already belong to an organisation.' using errcode = 'P0001', hint = 'already_member';
  end if;

  insert into public.organisations (name, created_by)
  values (btrim(organisation_name), uid)
  returning id into org_id;

  insert into public.memberships (organisation_id, user_id, role, created_by)
  values (org_id, uid, 'admin', uid);

  return org_id;
end;
$$;

-- Invite someone by email. Returns the one-time token for the invitation link.
create function public.create_invitation(invite_email text, invite_role public.app_role)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := private.current_org_id();
  clean_email text := lower(btrim(invite_email));
  new_token text := encode(extensions.gen_random_bytes(32), 'hex');
  new_id uuid;
begin
  if org is null or not private.has_role('admin') then
    raise exception 'Only admins can invite people.' using errcode = '42501';
  end if;
  -- Only checks this organisation, so admins learn nothing about other companies' users.
  -- Someone already in another organisation is stopped when they try to accept.
  if exists (
    select 1 from public.memberships m join public.profiles p on p.id = m.user_id
    where p.email = clean_email and m.organisation_id = org
  ) then
    raise exception 'That person is already a member.'
      using errcode = 'P0001', hint = 'already_member';
  end if;

  -- Re-inviting replaces any open invitation for the same email.
  update public.invitations i
     set revoked_at = now()
   where i.organisation_id = org and i.email = clean_email
     and i.accepted_at is null and i.revoked_at is null;

  insert into public.invitations (organisation_id, email, role, token_hash, created_by)
  values (org, clean_email, invite_role, encode(extensions.digest(new_token, 'sha256'), 'hex'), auth.uid())
  returning id into new_id;

  return query select new_id, new_token;
end;
$$;

create function public.revoke_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role('admin') then
    raise exception 'Only admins can cancel invitations.' using errcode = '42501';
  end if;
  update public.invitations i
     set revoked_at = now()
   where i.id = target_invitation_id
     and i.organisation_id = private.current_org_id()
     and i.accepted_at is null and i.revoked_at is null;
  if not found then
    raise exception 'Invitation not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- What the invitation page shows before sign-in. Only for holders of the token.
create function public.get_invitation(invite_token text)
returns table (organisation_name text, email text, role public.app_role, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name, i.email, i.role,
    case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at < now() then 'expired'
      else 'open'
    end
  from public.invitations i
  join public.organisations o on o.id = i.organisation_id
  where i.token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex');
$$;

create function public.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  inv public.invitations;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into inv from public.invitations i
   where i.token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
   for update;

  if inv.id is null or inv.revoked_at is not null then
    raise exception 'This invitation is no longer valid.' using errcode = 'P0001', hint = 'invalid';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invitation has already been used.' using errcode = 'P0001', hint = 'used';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invitation has expired.' using errcode = 'P0001', hint = 'expired';
  end if;

  select lower(u.email) into user_email from auth.users u where u.id = uid;
  if user_email is distinct from inv.email then
    raise exception 'This invitation was sent to a different email address.'
      using errcode = 'P0001', hint = 'wrong_email';
  end if;
  if exists (select 1 from public.memberships m where m.user_id = uid) then
    raise exception 'You already belong to an organisation.' using errcode = 'P0001', hint = 'already_member';
  end if;

  insert into public.memberships (organisation_id, user_id, role, created_by)
  values (inv.organisation_id, uid, inv.role, inv.created_by);

  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;

  return inv.organisation_id;
end;
$$;

revoke all on function public.create_organisation(text) from public, anon;
revoke all on function public.create_invitation(text, public.app_role) from public, anon;
revoke all on function public.revoke_invitation(uuid) from public, anon;
revoke all on function public.get_invitation(text) from public;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_organisation(text) to authenticated;
grant execute on function public.create_invitation(text, public.app_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: files live under "<organisation_id>/..." in a private bucket (spec 5)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('organisation-files', 'organisation-files', false)
on conflict (id) do nothing;

create policy "Members read their organisation's files" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'organisation-files'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
  );

create policy "Staff upload to their organisation's folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'organisation-files'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and (select private.has_role('admin', 'planner', 'driver'))
  );

create policy "Staff replace their organisation's files" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'organisation-files'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and (select private.has_role('admin', 'planner', 'driver'))
  )
  with check (
    bucket_id = 'organisation-files'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
  );

create policy "Admins and planners delete their organisation's files" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'organisation-files'
    and (storage.foldername(name))[1] = (select private.current_org_id())::text
    and (select private.has_role('admin', 'planner'))
  );
