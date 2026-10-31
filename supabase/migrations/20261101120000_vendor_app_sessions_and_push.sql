-- Chapega Studio app: phone sessions and new-order push notifications.
--
-- Phone sessions are vendor_sessions rows with their own scope, 'vendor_app'.
-- Every existing query, policy and index that filters session_scope = 'vendor'
-- (web sign-in, sign-out, the cookie lookup, the vendor-wide select clause)
-- keeps ignoring them, so the web Studio behaves exactly as before, and an
-- older build of the app can neither accept nor delete a phone session. A
-- phone's token arrives as Authorization: Bearer and is only ever looked up
-- with this scope; a cookie is only ever looked up as 'vendor'.
--
-- Push tokens live in a table that only the narrow SECURITY DEFINER functions
-- below can touch. It is keyed by the session hash with ON DELETE CASCADE, so
-- every way a session ends (sign-out, the expiry purge, a password change,
-- deactivation, a reset) also stops that phone's notifications.
-- order_push_dispatches records that an order was announced, so no order is
-- announced twice.
--
-- Safe while the previous app version is live: its inserts are 'vendor' rows
-- without device columns, which the new constraints accept, and the two
-- replaced functions behave identically for 'vendor' sessions.
begin;

set local lock_timeout = '10s';

-- 1. Phone sessions: their own scope, and the device they belong to.
alter table private.vendor_sessions
  add column device_hash text,
  add column device_platform text,
  add column device_model text,
  add column app_version text;

alter table private.vendor_sessions
  drop constraint vendor_sessions_scope_check;

alter table private.vendor_sessions
  add constraint vendor_sessions_scope_check check (
    (
      session_scope = 'vendor'
      and active_vendor_id is not null
      and device_hash is null
      and device_platform is null
      and device_model is null
      and app_version is null
    )
    or (
      session_scope = 'platform'
      and active_vendor_id is null
      and device_hash is null
      and device_platform is null
      and device_model is null
      and app_version is null
    )
    or (
      session_scope = 'vendor_app'
      and active_vendor_id is not null
      and device_hash ~ '^[0-9a-f]{64}$'
      and device_platform in ('android', 'ios')
    )
  ),
  add constraint vendor_sessions_device_model_check check (
    device_model is null
    or (device_model = btrim(device_model) and char_length(device_model) between 1 and 60)
  ),
  add constraint vendor_sessions_app_version_check check (
    app_version is null or app_version ~ '^[0-9A-Za-z.+_-]{1,32}$'
  ),
  -- The app keeps each session within its configured lifetime; this is the
  -- ceiling no configuration can pass. NOT VALID: older rows are not rechecked.
  add constraint vendor_sessions_lifetime_check check (
    expires_at <= created_at + case session_scope
      when 'vendor_app' then interval '90 days'
      else interval '168 hours'
    end
  ) not valid,
  -- Target of the push registrations' composite foreign key.
  add constraint vendor_sessions_id_hash_scope_key unique (id_hash, session_scope);

-- One session per person per phone: signing in again replaces it.
create unique index vendor_sessions_app_device_key
  on private.vendor_sessions (user_id, device_hash)
  where session_scope = 'vendor_app';

create index vendor_sessions_app_user_expires_idx
  on private.vendor_sessions (user_id, expires_at desc)
  where session_scope = 'vendor_app';

-- 2. A phone session needs the same live membership as a Studio session.
drop policy chapega_sessions_insert on private.vendor_sessions;
create policy chapega_sessions_insert
  on private.vendor_sessions
  for insert
  to chapega_app
  with check (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and (
      (
        session_scope in ('vendor', 'vendor_app')
        and active_vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
        and exists (
          select 1
          from private.vendor_memberships memberships
          join private.vendors vendors on vendors.id = memberships.vendor_id
          where memberships.user_id = vendor_sessions.user_id
            and memberships.vendor_id = vendor_sessions.active_vendor_id
            and memberships.active
            and vendors.status = 'active'
        )
      )
      or (
        session_scope = 'platform'
        and active_vendor_id is null
        and exists (
          select 1
          from private.vendor_users users
          where users.id = vendor_sessions.user_id
            and users.active
            and users.platform_role = 'super_admin'
        )
      )
    )
  );

-- 3. Sliding idle deadline with a ceiling per scope. The column grant from
-- 20261008130000 (update (expires_at) only) still applies, so neither the
-- scope nor created_at can change through this policy.
drop policy chapega_sessions_refresh on private.vendor_sessions;
create policy chapega_sessions_refresh
  on private.vendor_sessions
  for update
  to chapega_app
  using (
    id_hash = nullif(current_setting('app.session_hash', true), '')
    and expires_at > now()
  )
  with check (
    id_hash = nullif(current_setting('app.session_hash', true), '')
    and expires_at <= created_at + case session_scope
      when 'vendor_app' then interval '90 days'
      else interval '168 hours'
    end
  );

-- 4. Owners manage their team from the phone too, and deactivating someone
-- also signs their phones out of that shop.
create or replace function private.current_vendor_owner_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sessions.user_id
  from private.vendor_sessions sessions
  join private.vendor_users users on users.id = sessions.user_id
  join private.vendor_memberships memberships on memberships.user_id = sessions.user_id
  join private.vendors vendors on vendors.id = memberships.vendor_id
  where sessions.id_hash = nullif(current_setting('app.session_hash', true), '')
    and sessions.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and sessions.session_scope in ('vendor', 'vendor_app')
    and sessions.expires_at > now()
    and memberships.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    and memberships.active
    and memberships.role = 'owner'
    and users.active
    and not users.must_change_password
    and vendors.status = 'active'
  limit 1
$$;

revoke all on function private.current_vendor_owner_id()
  from public, anon, authenticated, service_role, chapega_app;

create or replace function private.set_vendor_team_member_active(p_user_id uuid, p_active boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := private.current_vendor_owner_id();
  v_vendor_id uuid := nullif(current_setting('app.vendor_id', true), '')::uuid;
  v_current_role text;
  v_current_active boolean;
begin
  if v_owner_id is null then
    return 'forbidden';
  end if;
  if p_user_id = v_owner_id then
    return 'self';
  end if;
  if p_active is null then
    return 'invalid_state';
  end if;

  select memberships.role, memberships.active into v_current_role, v_current_active
  from private.vendor_memberships memberships
  where memberships.vendor_id = v_vendor_id
    and memberships.user_id = p_user_id
  for update;
  if not found then
    return 'not_found';
  end if;
  if v_current_role = 'owner' then
    return 'owner_protected';
  end if;
  if v_current_active = p_active then
    return 'unchanged';
  end if;

  -- One active default membership per user
  -- (vendor_memberships_one_default_per_user_idx).
  update private.vendor_memberships
  set active = p_active,
      is_default = is_default and not (
        p_active and exists (
          select 1
          from private.vendor_memberships others
          where others.user_id = p_user_id
            and others.vendor_id <> v_vendor_id
            and others.active
            and others.is_default
        )
      )
  where vendor_id = v_vendor_id
    and user_id = p_user_id;

  if not p_active then
    delete from private.vendor_sessions
    where user_id = p_user_id
      and session_scope in ('vendor', 'vendor_app')
      and active_vendor_id = v_vendor_id;
  end if;

  insert into private.audit_log
    (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
  values
    (gen_random_uuid(), v_vendor_id, v_owner_id::text,
     case when p_active then 'team.member.reactivated' else 'team.member.deactivated' end,
     'membership', p_user_id::text, now());
  return 'updated';
end;
$$;

revoke all on function private.set_vendor_team_member_active(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.set_vendor_team_member_active(uuid, boolean) to chapega_app;

-- 5. Push registrations: one per phone session, one session per FCM token.
create table private.vendor_push_registrations (
  session_id_hash text primary key,
  session_scope text not null default 'vendor_app'
    constraint vendor_push_registrations_scope_check check (session_scope = 'vendor_app'),
  fcm_token text not null
    constraint vendor_push_registrations_token_check
    -- Length apart: Postgres regular expressions repeat at most 255 times.
    check (fcm_token ~ '^[A-Za-z0-9_:.-]+$' and char_length(fcm_token) between 32 and 4096),
  -- Unique on the hash: a btree entry for a 4 KB token would be too large.
  fcm_token_hash text not null
    constraint vendor_push_registrations_token_hash_check
    check (fcm_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_push_registrations_token_key unique (fcm_token_hash),
  constraint vendor_push_registrations_session_fkey
    foreign key (session_id_hash, session_scope)
    references private.vendor_sessions (id_hash, session_scope)
    on delete cascade
);

create trigger vendor_push_registrations_touch_updated_at
  before update on private.vendor_push_registrations
  for each row execute function private.touch_updated_at();

-- 6. One announcement per order.
create table private.order_push_dispatches (
  vendor_id uuid not null,
  order_id uuid not null,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  sent_count integer,
  failed_count integer,
  constraint order_push_dispatches_pkey primary key (vendor_id, order_id),
  constraint order_push_dispatches_order_fkey
    foreign key (vendor_id, order_id)
    references private.orders (vendor_id, id)
    on delete cascade,
  constraint order_push_dispatches_result_check check (
    (completed_at is null and sent_count is null and failed_count is null)
    or (completed_at >= claimed_at and sent_count >= 0 and failed_count >= 0)
  )
);

create index order_push_dispatches_claimed_at_idx
  on private.order_push_dispatches (claimed_at);

-- No policies at all: only the functions below (running as their owner) read
-- or write these tables. Default privileges would give chapega_app full
-- access to every new private table, so take that back.
alter table private.vendor_push_registrations enable row level security;
alter table private.vendor_push_registrations force row level security;
alter table private.order_push_dispatches enable row level security;
alter table private.order_push_dispatches force row level security;

revoke all on private.vendor_push_registrations
  from public, anon, authenticated, service_role, chapega_app;
revoke all on private.order_push_dispatches
  from public, anon, authenticated, service_role, chapega_app;

-- 7. Functions.

-- The user behind the live phone session this request presented
-- (app.session_hash and app.user_id must agree). Internal.
create function private.current_app_session_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sessions.user_id
  from private.vendor_sessions sessions
  join private.vendor_users users on users.id = sessions.user_id
  where sessions.id_hash = nullif(current_setting('app.session_hash', true), '')
    and sessions.user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and sessions.session_scope = 'vendor_app'
    and sessions.expires_at > now()
    and users.active
  limit 1
$$;

revoke all on function private.current_app_session_user_id()
  from public, anon, authenticated, service_role, chapega_app;

-- The presented phone session receives notifications at this FCM token. A
-- token belongs to one session: on a shared phone, the previous person's
-- session stops getting them.
create function private.register_push_token(p_fcm_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_hash text := nullif(current_setting('app.session_hash', true), '');
  v_token_hash text;
begin
  if p_fcm_token is null
    or char_length(p_fcm_token) not between 32 and 4096
    or p_fcm_token !~ '^[A-Za-z0-9_:.-]+$' then
    return 'invalid_token';
  end if;
  if private.current_app_session_user_id() is null then
    return 'forbidden';
  end if;
  v_token_hash := encode(sha256(convert_to(p_fcm_token, 'UTF8')), 'hex');
  -- Two sessions registering the same token at once take turns here.
  perform pg_advisory_xact_lock(hashtextextended('chapega.push:' || v_token_hash, 0));
  delete from private.vendor_push_registrations
  where fcm_token_hash = v_token_hash
    and session_id_hash <> v_session_hash;
  insert into private.vendor_push_registrations (session_id_hash, fcm_token, fcm_token_hash)
  values (v_session_hash, p_fcm_token, v_token_hash)
  on conflict (session_id_hash) do update
    set fcm_token = excluded.fcm_token,
        fcm_token_hash = excluded.fcm_token_hash;
  return 'registered';
exception
  -- The session ended while this ran.
  when foreign_key_violation then
    return 'forbidden';
end;
$$;

-- The presented phone session stops receiving notifications.
create function private.unregister_push_token()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  if private.current_app_session_user_id() is null then
    return false;
  end if;
  delete from private.vendor_push_registrations
  where session_id_hash = nullif(current_setting('app.session_hash', true), '');
  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;

-- Claims a fresh kiosk order for announcement and returns where to send it:
-- the phones of active, unflagged members of the shop whose sessions are live
-- and younger than p_max_session_age. A second claim of the same order, an
-- order that is no longer waiting or older than 15 minutes, or a suspended
-- shop returns nothing. Never returns session hashes.
create function private.claim_order_push_targets(
  p_vendor_id uuid,
  p_order_id uuid,
  p_max_session_age interval
)
returns table (fcm_token_hash text, fcm_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_max_session_age is null
    or p_max_session_age <= interval '0'
    or p_max_session_age > interval '90 days' then
    raise exception 'p_max_session_age must be more than 0 and at most 90 days'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from private.orders orders
    join private.vendors vendors on vendors.id = orders.vendor_id
    where orders.vendor_id = p_vendor_id
      and orders.id = p_order_id
      and orders.status = 'prepared'
      and orders.created_at > now() - interval '15 minutes'
      and vendors.status = 'active'
  ) then
    return;
  end if;
  insert into private.order_push_dispatches (vendor_id, order_id)
  values (p_vendor_id, p_order_id)
  on conflict do nothing;
  if not found then
    return;
  end if;
  return query
    select registrations.fcm_token_hash, registrations.fcm_token
    from private.vendor_push_registrations registrations
    join private.vendor_sessions sessions
      on sessions.id_hash = registrations.session_id_hash
      and sessions.session_scope = 'vendor_app'
    join private.vendor_users users on users.id = sessions.user_id
    join private.vendor_memberships memberships
      on memberships.user_id = sessions.user_id
      and memberships.vendor_id = p_vendor_id
    where sessions.expires_at > now()
      and sessions.created_at > now() - p_max_session_age
      and users.active
      and not users.must_change_password
      and memberships.active
    order by registrations.updated_at desc
    limit 200;
end;
$$;

-- Records how an announcement went (once, within 15 minutes of the claim) and
-- removes the tokens FCM rejected, but only those of this shop's members.
-- Returns the number of registrations removed.
create function private.finish_order_push(
  p_vendor_id uuid,
  p_order_id uuid,
  p_sent integer,
  p_failed integer,
  p_unregistered text[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_removed integer := 0;
begin
  update private.order_push_dispatches
  set completed_at = now(),
      sent_count = greatest(coalesce(p_sent, 0), 0),
      failed_count = greatest(coalesce(p_failed, 0), 0)
  where vendor_id = p_vendor_id
    and order_id = p_order_id
    and completed_at is null
    and claimed_at > now() - interval '15 minutes';
  if not found then
    return 0;
  end if;
  if coalesce(cardinality(p_unregistered), 0) > 0 then
    delete from private.vendor_push_registrations registrations
    using private.vendor_sessions sessions, private.vendor_memberships memberships
    where registrations.fcm_token_hash = any (p_unregistered[1:200])
      and sessions.id_hash = registrations.session_id_hash
      and memberships.user_id = sessions.user_id
      and memberships.vendor_id = p_vendor_id;
    get diagnostics v_removed = row_count;
  end if;
  return v_removed;
end;
$$;

revoke all on function private.register_push_token(text)
  from public, anon, authenticated, service_role;
revoke all on function private.unregister_push_token()
  from public, anon, authenticated, service_role;
revoke all on function private.claim_order_push_targets(uuid, uuid, interval)
  from public, anon, authenticated, service_role;
revoke all on function private.finish_order_push(uuid, uuid, integer, integer, text[])
  from public, anon, authenticated, service_role;

grant execute on function private.register_push_token(text) to chapega_app;
grant execute on function private.unregister_push_token() to chapega_app;
grant execute on function private.claim_order_push_targets(uuid, uuid, interval) to chapega_app;
grant execute on function private.finish_order_push(uuid, uuid, integer, integer, text[])
  to chapega_app;

-- 8. The nightly purge also forgets old announcement records (they only
-- prevent a second notification for an order that is minutes old).
create or replace function private.purge_expired_records()
returns table (sessions_deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed bigint;
begin
  delete from private.vendor_sessions
  where expires_at < now() - interval '1 day';
  get diagnostics removed = row_count;
  delete from private.order_push_dispatches
  where claimed_at < now() - interval '30 days';
  return query select removed;
end;
$$;

revoke all on function private.purge_expired_records()
  from public, anon, authenticated, service_role, chapega_app;

commit;
