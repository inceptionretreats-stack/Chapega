-- Authentication hardening (audit 2026-10-08).
--
-- vendor_users only accepts writes from a live platform-admin session, which
-- is right for administration but means a user's own successful sign-in can
-- never upgrade their password hash to the current scrypt parameters.
begin;

-- AUD-18: let a signed-in user replace only their own password hash, only
-- with a modern `scrypt$N=…,r=…,p=…$…` hash, and only if the stored hash is
-- still the one that was just verified (compare-and-swap). Nothing else on
-- the row can change through this path.
create function private.rehash_own_password(
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
  changed integer;
begin
  if p_user_id is distinct from nullif(current_setting('app.user_id', true), '')::uuid then
    return false;
  end if;
  if p_new_hash !~ '^scrypt\$N=[0-9]+,r=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+=*$' then
    return false;
  end if;
  update private.vendor_users
  set password_salt = p_new_salt,
      password_hash = p_new_hash
  where id = p_user_id
    and active
    and password_hash = p_expected_hash;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function private.rehash_own_password(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.rehash_own_password(uuid, text, text, text)
  to chapega_app;

commit;
