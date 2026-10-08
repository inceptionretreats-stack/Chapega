begin;

-- Repair databases where the former provisioning step replayed the original
-- role migration and recreated blanket runtime policies. Permissive policies
-- are OR'd together, so a single USING (true) policy cancels tenant isolation.
do $$
declare
  target record;
begin
  for target in
    select tablename
    from pg_policies
    where schemaname = 'private'
      and policyname = 'chapega_app_full_access'
  loop
    execute format(
      'drop policy chapega_app_full_access on private.%I',
      target.tablename
    );
  end loop;
end
$$;

-- Every catalogue, order and settings write bumps the tenant's own vendor
-- revision. Allow exactly that row to be updated by an active tenant; the
-- trigger below keeps identity and status changes platform-only.
create policy chapega_vendors_tenant_touch
  on private.vendors
  for update
  to chapega_app
  using (
    id = nullif(current_setting('app.vendor_id', true), '')::uuid
    and (select private.current_vendor_is_active())
  )
  with check (
    id = nullif(current_setting('app.vendor_id', true), '')::uuid
  );

create function private.guard_vendor_tenant_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.has_platform_admin_session()) then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.slug is distinct from old.slug
    or new.display_name is distinct from old.display_name
    or new.status is distinct from old.status
    or new.created_at is distinct from old.created_at
    or new.revision < old.revision
  then
    raise exception 'Only a platform administrator can change vendor identity or status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_vendor_tenant_update()
  from public, anon, authenticated, service_role;

create trigger vendors_guard_tenant_update
  before update on private.vendors
  for each row
  execute function private.guard_vendor_tenant_update();

commit;
