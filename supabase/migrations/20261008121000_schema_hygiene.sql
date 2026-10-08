begin;

-- Every table records when a row last changed. Triggers keep the value
-- current, so application writes that predate this column stay correct.
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

revoke all on function private.touch_updated_at()
  from public, anon, authenticated, service_role;

alter table private.vendor_users
  add column updated_at timestamptz not null default now();
alter table private.vendor_memberships
  add column updated_at timestamptz not null default now();
alter table private.product_variants
  add column updated_at timestamptz not null default now();
alter table private.order_items
  add column updated_at timestamptz not null default now();
alter table private.vendor_assets
  add column updated_at timestamptz not null default now();

create trigger vendor_users_touch_updated_at
  before update on private.vendor_users
  for each row execute function private.touch_updated_at();
create trigger vendor_memberships_touch_updated_at
  before update on private.vendor_memberships
  for each row execute function private.touch_updated_at();
create trigger product_variants_touch_updated_at
  before update on private.product_variants
  for each row execute function private.touch_updated_at();
create trigger order_items_touch_updated_at
  before update on private.order_items
  for each row execute function private.touch_updated_at();
create trigger vendor_assets_touch_updated_at
  before update on private.vendor_assets
  for each row execute function private.touch_updated_at();

-- Audit history is append-only for the runtime role. DELETE remains for the
-- explicit tenant import, which replaces that tenant's audit rows.
revoke update on private.audit_log from chapega_app;

-- Expired sessions otherwise accumulate forever. Run as the owner on a
-- schedule (for example with pg_cron); see the runbook.
create function private.purge_expired_records()
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
  return query select removed;
end;
$$;

revoke all on function private.purge_expired_records()
  from public, anon, authenticated, service_role, chapega_app;

commit;
