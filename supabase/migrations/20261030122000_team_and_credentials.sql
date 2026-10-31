-- Team management and password changes.
--
-- vendor_users and vendor_memberships accept writes only from a live
-- platform-admin session, so a shop owner could not add staff and nobody could
-- change their own password. Rather than widen those policies, each operation
-- below is a narrow SECURITY DEFINER function (the pattern of
-- rehash_own_password in 20261008130000). Every one first proves who is asking
-- from the session the request presented (app.session_hash), never from
-- app.vendor_id or app.user_id alone. No policy or table grant changes here.
--
-- must_change_password makes a password someone else chose temporary: it is
-- set when an admin creates or resets an owner, or an owner adds or resets a
-- member, and cleared only when the person chooses their own password.
begin;

set local lock_timeout = '10s';

alter table private.vendor_users
  add column must_change_password boolean not null default false;

-- Platform admins change their own passwords; nobody else issues theirs.
alter table private.vendor_users
  add constraint vendor_users_password_change_scope_check
  check (not (must_change_password and platform_role is not null));

-- The owner behind the session this request presented, when that session is
-- live and its user is an active, unflagged owner of app.vendor_id (an active
-- vendor). Null otherwise. Internal: not executable by chapega_app.
create function private.current_vendor_owner_id()
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
    and sessions.session_scope = 'vendor'
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

-- A signed-in user replaces their own password. Compare-and-swap on the hash
-- the app just verified; clears must_change_password; signs out every other
-- session of that user (the presented one stays). Same advisory lock key as
-- sign-in, so a sign-in in flight either sees the new hash or loses its session.
create function private.change_own_password(
  p_user_id uuid,
  p_expected_hash text,
  p_new_salt text,
  p_new_hash text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session_hash text := nullif(current_setting('app.session_hash', true), '');
  v_scope text;
  v_vendor_id uuid;
  v_changed integer;
begin
  if p_user_id is distinct from nullif(current_setting('app.user_id', true), '')::uuid then
    return false;
  end if;
  if coalesce(p_new_hash, '') !~ '^scrypt\$N=[0-9]+,r=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+=*$' then
    return false;
  end if;

  select sessions.session_scope, sessions.active_vendor_id
    into v_scope, v_vendor_id
  from private.vendor_sessions sessions
  where sessions.id_hash = v_session_hash
    and sessions.user_id = p_user_id
    and sessions.expires_at > now();
  if not found then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update private.vendor_users
  set password_salt = p_new_salt,
      password_hash = p_new_hash,
      must_change_password = false
  where id = p_user_id
    and active
    and password_hash = p_expected_hash;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then
    return false;
  end if;

  delete from private.vendor_sessions
  where user_id = p_user_id
    and id_hash <> v_session_hash;

  insert into private.audit_log
    (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
  values (
    gen_random_uuid(),
    v_vendor_id,
    p_user_id::text,
    case v_scope when 'platform' then 'platform.password.changed' else 'vendor.password.changed' end,
    'auth',
    p_user_id::text,
    now()
  );
  return true;
end;
$$;

-- Owners only: everyone who can sign in to this shop, including deactivated
-- members (so they can be reactivated). shared_account marks a platform admin
-- or someone who also belongs to another shop.
create function private.list_vendor_team()
returns table (
  member_id uuid,
  member_name text,
  member_email text,
  member_role text,
  membership_active boolean,
  account_active boolean,
  password_change_pending boolean,
  shared_account boolean,
  member_since timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid := nullif(current_setting('app.vendor_id', true), '')::uuid;
begin
  if private.current_vendor_owner_id() is null then
    raise exception 'Only the shop owner can manage the team.' using errcode = '42501';
  end if;
  return query
    select users.id, users.name, users.email, memberships.role, memberships.active,
           users.active, users.must_change_password,
           users.platform_role is not null or exists (
             select 1
             from private.vendor_memberships others
             where others.user_id = users.id
               and others.vendor_id <> v_vendor_id
           ),
           memberships.created_at
    from private.vendor_memberships memberships
    join private.vendor_users users on users.id = memberships.user_id
    where memberships.vendor_id = v_vendor_id
    order by (memberships.role = 'owner') desc, memberships.active desc, users.name, users.email;
end;
$$;

-- Owners add a manager or staff member with a temporary password. An email
-- already on the platform is refused without saying where it is used.
create function private.add_vendor_team_member(
  p_user_id uuid,
  p_email text,
  p_name text,
  p_role text,
  p_password_salt text,
  p_password_hash text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := private.current_vendor_owner_id();
  v_vendor_id uuid := nullif(current_setting('app.vendor_id', true), '')::uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_existing_id uuid;
begin
  if v_owner_id is null then
    return 'forbidden';
  end if;
  if p_role is null or p_role not in ('manager', 'staff') then
    return 'invalid_role';
  end if;
  if coalesce(p_password_hash, '') !~ '^scrypt\$N=[0-9]+,r=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+=*$' then
    return 'invalid_password';
  end if;

  select users.id into v_existing_id
  from private.vendor_users users
  where lower(users.email) = v_email;
  if found then
    if exists (
      select 1
      from private.vendor_memberships memberships
      where memberships.vendor_id = v_vendor_id
        and memberships.user_id = v_existing_id
    ) then
      return 'already_member';
    end if;
    return 'email_unavailable';
  end if;

  begin
    insert into private.vendor_users (
      id, email, name, platform_role, password_salt, password_hash, active,
      must_change_password, created_at
    ) values (
      p_user_id, v_email, btrim(p_name), null, p_password_salt, p_password_hash, true,
      true, now()
    );
  exception when unique_violation then
    return 'email_unavailable';
  end;

  insert into private.vendor_memberships (vendor_id, user_id, role, active, is_default, created_at)
  values (v_vendor_id, p_user_id, p_role, true, true, now());

  insert into private.audit_log
    (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
  values
    (gen_random_uuid(), v_vendor_id, v_owner_id::text, 'team.member.added', 'membership',
     p_user_id::text, now());
  return 'created';
end;
$$;

-- Owners switch a member between manager and staff. Owners (including the
-- caller) are never changed here, so a shop cannot lose its owner.
create function private.set_vendor_team_member_role(p_user_id uuid, p_role text)
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
begin
  if v_owner_id is null then
    return 'forbidden';
  end if;
  if p_user_id = v_owner_id then
    return 'self';
  end if;
  if p_role is null or p_role not in ('manager', 'staff') then
    return 'invalid_role';
  end if;

  select memberships.role into v_current_role
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
  if v_current_role = p_role then
    return 'unchanged';
  end if;

  update private.vendor_memberships
  set role = p_role
  where vendor_id = v_vendor_id
    and user_id = p_user_id;

  insert into private.audit_log
    (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
  values
    (gen_random_uuid(), v_vendor_id, v_owner_id::text, 'team.member.role.' || p_role,
     'membership', p_user_id::text, now());
  return 'updated';
end;
$$;

-- Owners deactivate or reactivate a member's access to this shop only.
-- Deactivating signs them out of this shop now; the account and its other
-- shops are untouched.
create function private.set_vendor_team_member_active(p_user_id uuid, p_active boolean)
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
      and session_scope = 'vendor'
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

-- Owners set a temporary password for a member who belongs to this shop only.
-- Refused for platform admins and anyone with another shop, so an owner can
-- never obtain credentials that open somewhere else.
create function private.reset_vendor_team_password(
  p_user_id uuid,
  p_password_salt text,
  p_password_hash text
)
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
begin
  if v_owner_id is null then
    return 'forbidden';
  end if;
  if p_user_id = v_owner_id then
    return 'self';
  end if;
  if coalesce(p_password_hash, '') !~ '^scrypt\$N=[0-9]+,r=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+=*$' then
    return 'invalid_password';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select memberships.role into v_current_role
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
  if exists (
    select 1
    from private.vendor_users users
    where users.id = p_user_id
      and (users.platform_role is not null or not users.active)
  ) or exists (
    select 1
    from private.vendor_memberships others
    where others.user_id = p_user_id
      and others.vendor_id <> v_vendor_id
  ) then
    return 'managed_elsewhere';
  end if;

  update private.vendor_users
  set password_salt = p_password_salt,
      password_hash = p_password_hash,
      must_change_password = true
  where id = p_user_id;
  delete from private.vendor_sessions where user_id = p_user_id;

  insert into private.audit_log
    (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
  values
    (gen_random_uuid(), v_vendor_id, v_owner_id::text, 'team.member.password_reset',
     'membership', p_user_id::text, now());
  return 'reset';
end;
$$;

-- A platform admin sets a temporary password for a shop's owner (a locked-out
-- owner). The admin is the one behind the presented platform session.
create function private.reset_vendor_owner_password(
  p_vendor_id uuid,
  p_owner_id uuid,
  p_password_salt text,
  p_password_hash text,
  p_audit_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_platform_role text;
  v_active boolean;
begin
  select sessions.user_id into v_admin_id
  from private.vendor_sessions sessions
  join private.vendor_users users on users.id = sessions.user_id
  where sessions.id_hash = nullif(current_setting('app.session_hash', true), '')
    and sessions.session_scope = 'platform'
    and sessions.active_vendor_id is null
    and sessions.expires_at > now()
    and users.active
    and users.platform_role = 'super_admin';
  if not found then
    return 'forbidden';
  end if;
  if coalesce(p_password_hash, '') !~ '^scrypt\$N=[0-9]+,r=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+=*$' then
    return 'invalid_password';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));
  if not exists (
    select 1
    from private.vendor_memberships memberships
    where memberships.vendor_id = p_vendor_id
      and memberships.user_id = p_owner_id
      and memberships.role = 'owner'
  ) then
    return 'not_found';
  end if;
  select users.platform_role, users.active into v_platform_role, v_active
  from private.vendor_users users
  where users.id = p_owner_id
  for update;
  if v_platform_role is not null then
    return 'platform_admin';
  end if;
  if not v_active then
    return 'inactive';
  end if;

  update private.vendor_users
  set password_salt = p_password_salt,
      password_hash = p_password_hash,
      must_change_password = true
  where id = p_owner_id;
  delete from private.vendor_sessions where user_id = p_owner_id;

  insert into private.audit_log
    (id, vendor_id, actor_id, action, entity_type, entity_id, created_at)
  values
    (p_audit_id, p_vendor_id, v_admin_id::text, 'platform.owner.password_reset', 'membership',
     p_owner_id::text, now());
  return 'reset';
end;
$$;

revoke all on function private.change_own_password(uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.list_vendor_team()
  from public, anon, authenticated, service_role;
revoke all on function private.add_vendor_team_member(uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.set_vendor_team_member_role(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.set_vendor_team_member_active(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.reset_vendor_team_password(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.reset_vendor_owner_password(uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function private.change_own_password(uuid, text, text, text) to chapega_app;
grant execute on function private.list_vendor_team() to chapega_app;
grant execute on function private.add_vendor_team_member(uuid, text, text, text, text, text)
  to chapega_app;
grant execute on function private.set_vendor_team_member_role(uuid, text) to chapega_app;
grant execute on function private.set_vendor_team_member_active(uuid, boolean) to chapega_app;
grant execute on function private.reset_vendor_team_password(uuid, text, text) to chapega_app;
grant execute on function private.reset_vendor_owner_password(uuid, uuid, text, text, uuid)
  to chapega_app;

commit;
