begin;

-- A shop renamed in Studio settings kept its old name in page titles, the
-- Studio header, the shop picker and the admin table, because the trigger
-- below refused tenant changes to vendors.display_name. The app now writes the
-- settings shop name to display_name in the same transaction.
--
-- display_name is relaxed for the tenant's own row only: the policy
-- chapega_vendors_tenant_touch (20261008120000) still limits updates to
-- app.vendor_id, and slug, status, id, created_at and the revision floor stay
-- platform-only.
create or replace function private.guard_vendor_tenant_update()
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

-- Heal shops renamed before this release.
update private.vendors vendors
set display_name = settings.shop_name
from private.shop_settings settings
where settings.vendor_id = vendors.id
  and vendors.display_name is distinct from settings.shop_name;

commit;
