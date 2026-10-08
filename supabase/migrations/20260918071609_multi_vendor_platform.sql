begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- This identifier is deliberately stable. It makes the single-shop -> tenant
-- backfill deterministic in every environment without relying on extensions.
create table private.vendors (
  id uuid primary key,
  slug text not null,
  display_name text not null,
  status text not null default 'active',
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_slug_check check (
    slug = lower(btrim(slug))
    and char_length(slug) between 2 and 63
    and slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
  ),
  constraint vendors_display_name_check check (
    display_name = btrim(display_name)
    and char_length(display_name) between 1 and 80
  ),
  constraint vendors_status_check check (status in ('active', 'suspended')),
  constraint vendors_revision_check check (revision > 0),
  constraint vendors_timestamps_check check (updated_at >= created_at)
);

create unique index vendors_slug_lower_key
  on private.vendors ((lower(slug)));

create index vendors_status_updated_at_idx
  on private.vendors (status, updated_at desc);

insert into private.vendors (
  id,
  slug,
  display_name,
  status,
  revision,
  created_at,
  updated_at
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  'chapega',
  coalesce(
    (select nullif(btrim(shop_name), '') from private.shop_settings where id = 1),
    'Chapega.com'
  ),
  'active',
  coalesce((select revision from private.app_state where id = 1), 1),
  coalesce((select updated_at from private.app_state where id = 1), now()),
  now();

alter table private.vendor_users
  add column platform_role text;

alter table private.vendor_users
  add constraint vendor_users_platform_role_check check (
    platform_role is null or platform_role = 'super_admin'
  );

create index vendor_users_platform_role_idx
  on private.vendor_users (platform_role, created_at desc)
  where active and platform_role is not null;

create table private.vendor_memberships (
  vendor_id uuid not null,
  user_id uuid not null,
  role text not null,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint vendor_memberships_pkey primary key (vendor_id, user_id),
  constraint vendor_memberships_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict,
  constraint vendor_memberships_user_id_fkey
    foreign key (user_id)
    references private.vendor_users (id)
    on delete cascade,
  constraint vendor_memberships_role_check check (
    role in ('owner', 'manager', 'staff')
  )
);

create index vendor_memberships_user_active_idx
  on private.vendor_memberships (user_id, active, created_at desc);

create index vendor_memberships_vendor_role_active_idx
  on private.vendor_memberships (vendor_id, role, active, created_at desc);

create unique index vendor_memberships_one_default_per_user_idx
  on private.vendor_memberships (user_id)
  where active and is_default;

insert into private.vendor_memberships (
  vendor_id,
  user_id,
  role,
  active,
  is_default,
  created_at
)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  users.id,
  users.role,
  users.active,
  true,
  users.created_at
from private.vendor_users users;

-- Preserve the saved Chapega credentials while separating platform authority
-- from the vendor membership role. Only one deterministic active owner is
-- promoted, and only when the platform has no super administrator yet.
with promoted as (
  update private.vendor_users users
  set platform_role = 'super_admin'
  where users.id = (
    select candidate.id
    from private.vendor_users candidate
    where candidate.active and candidate.role = 'owner'
    order by candidate.created_at asc, candidate.id asc
    limit 1
  )
    and not exists (
      select 1
      from private.vendor_users existing
      where existing.platform_role = 'super_admin'
    )
  returning users.id
)
insert into private.audit_log (
  id,
  actor_id,
  action,
  entity_type,
  entity_id,
  created_at
)
select
  md5('chapega:platform-admin-promotion:' || promoted.id::text)::uuid,
  promoted.id::text,
  'platform.bootstrap_super_admin',
  'auth',
  promoted.id::text,
  now()
from promoted;

alter table private.vendor_users
  drop constraint vendor_users_role_check;

drop index if exists private.vendor_users_active_role_idx;

alter table private.vendor_users
  drop column role;

alter table private.vendor_sessions
  add column session_scope text not null default 'vendor',
  add column active_vendor_id uuid;

update private.vendor_sessions
set active_vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where session_scope = 'vendor' and active_vendor_id is null;

alter table private.vendor_sessions
  alter column session_scope drop default,
  add constraint vendor_sessions_scope_check check (
    (session_scope = 'vendor' and active_vendor_id is not null)
    or (session_scope = 'platform' and active_vendor_id is null)
  ),
  add constraint vendor_sessions_active_vendor_id_fkey
    foreign key (active_vendor_id)
    references private.vendors (id)
    on delete cascade;

create index vendor_sessions_scope_user_created_at_idx
  on private.vendor_sessions (session_scope, user_id, created_at desc);

create index vendor_sessions_active_vendor_expires_idx
  on private.vendor_sessions (active_vendor_id, expires_at)
  where session_scope = 'vendor';

-- Convert singleton and globally-keyed records to tenant-keyed records. Every
-- existing row is assigned before NOT NULL and foreign keys are installed.
alter table private.app_state
  add column vendor_id uuid;
update private.app_state
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null;
alter table private.app_state
  alter column vendor_id set not null,
  drop constraint app_state_pkey,
  add constraint app_state_pkey primary key (vendor_id),
  add constraint app_state_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict;

alter table private.shop_settings
  add column vendor_id uuid;
update private.shop_settings
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null;
alter table private.shop_settings
  alter column vendor_id set not null,
  drop constraint shop_settings_pkey,
  add constraint shop_settings_pkey primary key (vendor_id),
  add constraint shop_settings_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict;

alter table private.product_variants
  drop constraint product_variants_product_id_fkey,
  drop constraint product_variants_pkey,
  drop constraint product_variants_product_position_key;

alter table private.products
  add column vendor_id uuid;
update private.products
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null;
alter table private.products
  alter column vendor_id set not null,
  drop constraint products_pkey,
  add constraint products_pkey primary key (vendor_id, id),
  add constraint products_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict;

alter table private.product_variants
  add column vendor_id uuid;
update private.product_variants
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null;
alter table private.product_variants
  alter column vendor_id set not null,
  add constraint product_variants_pkey primary key (vendor_id, product_id, id),
  add constraint product_variants_product_id_fkey
    foreign key (vendor_id, product_id)
    references private.products (vendor_id, id)
    on delete cascade,
  add constraint product_variants_product_position_key
    unique (vendor_id, product_id, position),
  add constraint product_variants_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict;

alter table private.order_items
  drop constraint order_items_order_id_fkey,
  drop constraint order_items_pkey;

alter table private.order_events
  drop constraint order_events_order_id_fkey;

alter table private.orders
  add column vendor_id uuid;
update private.orders
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null;
alter table private.orders
  alter column vendor_id set not null,
  drop constraint orders_order_number_key,
  drop constraint orders_idempotency_key_key,
  add constraint orders_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict,
  add constraint orders_vendor_id_id_key unique (vendor_id, id),
  add constraint orders_vendor_order_number_key unique (vendor_id, order_number),
  add constraint orders_vendor_idempotency_key unique (vendor_id, idempotency_key);

alter table private.order_items
  add column vendor_id uuid;
update private.order_items
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null;
alter table private.order_items
  alter column vendor_id set not null,
  add constraint order_items_pkey primary key (vendor_id, order_id, position),
  add constraint order_items_order_id_fkey
    foreign key (vendor_id, order_id)
    references private.orders (vendor_id, id)
    on delete cascade,
  add constraint order_items_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict;

alter table private.order_events
  add column vendor_id uuid;
update private.order_events
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null;
alter table private.order_events
  alter column vendor_id set not null,
  add constraint order_events_order_id_fkey
    foreign key (vendor_id, order_id)
    references private.orders (vendor_id, id)
    on delete cascade,
  add constraint order_events_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict;

alter table private.audit_log
  add column vendor_id uuid;
update private.audit_log
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null and action <> 'platform.bootstrap_super_admin';
alter table private.audit_log
  drop constraint audit_log_entity_type_check,
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'auth', 'vendor', 'membership', 'platform', 'product', 'order', 'settings'
    )
  ),
  add constraint audit_log_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict;

alter table private.import_runs
  add column vendor_id uuid;
update private.import_runs
set vendor_id = '00000000-0000-4000-8000-000000000001'::uuid
where vendor_id is null;
alter table private.import_runs
  alter column vendor_id set not null,
  drop constraint import_runs_source_checksum_key,
  add constraint import_runs_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict,
  add constraint import_runs_vendor_checksum_key unique (vendor_id, source_checksum);

-- New uploads are recorded here before a product references them. The object
-- path is vendor-prefixed, so identical filenames from different shops cannot
-- collide even though the existing public bucket is retained.
create table private.vendor_assets (
  id uuid primary key,
  vendor_id uuid not null,
  storage_bucket text not null default 'vendor-products',
  object_path text not null,
  public_path text not null,
  content_sha256 text not null,
  mime_type text not null,
  byte_size bigint not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint vendor_assets_vendor_id_fkey
    foreign key (vendor_id)
    references private.vendors (id)
    on delete restrict,
  constraint vendor_assets_created_by_fkey
    foreign key (created_by)
    references private.vendor_users (id)
    on delete set null,
  constraint vendor_assets_bucket_check check (storage_bucket = 'vendor-products'),
  constraint vendor_assets_object_path_check check (
    object_path = btrim(object_path)
    and object_path like vendor_id::text || '/%'
    and object_path !~ '(^|/)\.\.(/|$)'
    and char_length(object_path) between 40 and 500
  ),
  constraint vendor_assets_public_path_check check (
    public_path = '/vendor-products/' || object_path
  ),
  constraint vendor_assets_hash_check check (content_sha256 ~ '^[0-9a-f]{64}$'),
  constraint vendor_assets_mime_check check (mime_type in ('image/png', 'image/jpeg')),
  constraint vendor_assets_size_check check (byte_size between 1 and 8388608),
  constraint vendor_assets_bucket_object_key unique (storage_bucket, object_path),
  constraint vendor_assets_vendor_public_path_key unique (vendor_id, public_path)
);

create index vendor_assets_vendor_created_at_idx
  on private.vendor_assets (vendor_id, created_at desc);

-- Keep legacy one-level image paths valid, and permit the new
-- /vendor-products/<vendor-id>/<filename> namespace.
alter table private.products
  drop constraint products_image_check,
  add constraint products_image_check check (
    image ~ '^/(products|generated-products)/[A-Za-z0-9._-]+[.](png|jpe?g|webp)$'
    or image ~ '^/vendor-products/(?:[a-z0-9-]+/)?[A-Za-z0-9._-]+[.](png|jpe?g|webp)$'
  );

alter table private.order_items
  drop constraint order_items_image_check,
  add constraint order_items_image_check check (
    image ~ '^/(products|generated-products)/[A-Za-z0-9._-]+[.](png|jpe?g|webp)$'
    or image ~ '^/vendor-products/(?:[a-z0-9-]+/)?[A-Za-z0-9._-]+[.](png|jpe?g|webp)$'
  );

-- Tenant-first indexes serve repository filters and make every RLS predicate
-- indexable. The older global indexes can remain as secondary access paths.
create index app_state_vendor_updated_at_idx
  on private.app_state (vendor_id, updated_at desc);
create index shop_settings_vendor_updated_at_idx
  on private.shop_settings (vendor_id, updated_at desc);
create index products_vendor_archived_updated_at_idx
  on private.products (vendor_id, archived, updated_at desc);
create index products_vendor_kiosk_category_idx
  on private.products (vendor_id, category, updated_at desc)
  where visible and not archived;
create index products_vendor_featured_idx
  on private.products (vendor_id, updated_at desc)
  where featured and visible and not archived;
create index product_variants_vendor_product_position_idx
  on private.product_variants (vendor_id, product_id, position);
create index orders_vendor_created_at_idx
  on private.orders (vendor_id, created_at desc);
create index orders_vendor_status_created_at_idx
  on private.orders (vendor_id, status, created_at desc);
create index orders_vendor_active_created_at_idx
  on private.orders (vendor_id, created_at desc)
  where status not in ('completed', 'cancelled');
create index order_items_vendor_product_order_idx
  on private.order_items (vendor_id, product_id, order_id);
create index order_events_vendor_order_created_at_idx
  on private.order_events (vendor_id, order_id, created_at, id);
create index audit_log_vendor_created_at_idx
  on private.audit_log (vendor_id, created_at desc);
create index audit_log_vendor_entity_created_at_idx
  on private.audit_log (vendor_id, entity_type, entity_id, created_at desc);
create index import_runs_vendor_status_started_at_idx
  on private.import_runs (vendor_id, status, started_at desc);

-- A platform bypass is valid only when the transaction supplies the hash of a
-- live platform-scoped session owned by an active super administrator. This is
-- intentionally stronger than a caller-controlled boolean GUC.
create function private.has_platform_admin_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.vendor_sessions sessions
    join private.vendor_users users on users.id = sessions.user_id
    where sessions.id_hash = nullif(current_setting('app.session_hash', true), '')
      and sessions.session_scope = 'platform'
      and sessions.active_vendor_id is null
      and sessions.expires_at > now()
      and users.active
      and users.platform_role = 'super_admin'
  );
$$;

revoke all on function private.has_platform_admin_session()
  from public, anon, authenticated, service_role;
grant execute on function private.has_platform_admin_session() to chapega_app;

create function private.current_vendor_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.vendors vendors
    where vendors.id = nullif(current_setting('app.vendor_id', true), '')::uuid
      and vendors.status = 'active'
  );
$$;

revoke all on function private.current_vendor_is_active()
  from public, anon, authenticated, service_role;
grant execute on function private.current_vendor_is_active() to chapega_app;

alter table private.vendors enable row level security;
alter table private.vendors force row level security;
alter table private.vendor_memberships enable row level security;
alter table private.vendor_memberships force row level security;
alter table private.vendor_assets enable row level security;
alter table private.vendor_assets force row level security;

grant select, insert, update, delete
  on private.vendors, private.vendor_memberships, private.vendor_assets
  to chapega_app;

-- Remove the original blanket policy from every private table. Policies below
-- keep the global identity/session tables narrow and bind all tenant data to
-- app.vendor_id. Platform access additionally requires a valid admin session.
do $$
declare
  table_name text;
begin
  for table_name in
    select tablename
    from pg_tables
    where schemaname = 'private'
    order by tablename
  loop
    execute format(
      'drop policy if exists chapega_app_full_access on private.%I',
      table_name
    );
  end loop;
end
$$;

create policy chapega_vendors_select
  on private.vendors
  for select
  to chapega_app
  using (
    id = nullif(current_setting('app.vendor_id', true), '')::uuid
    or (
      status = 'active'
      and slug = lower(nullif(current_setting('app.vendor_slug', true), ''))
    )
    or (select private.has_platform_admin_session())
  );

create policy chapega_vendors_platform_write
  on private.vendors
  for all
  to chapega_app
  using ((select private.has_platform_admin_session()))
  with check ((select private.has_platform_admin_session()));

create policy chapega_users_select
  on private.vendor_users
  for select
  to chapega_app
  using (
    id = nullif(current_setting('app.user_id', true), '')::uuid
    or email = lower(nullif(current_setting('app.auth_email', true), ''))
    or exists (
      select 1
      from private.vendor_memberships memberships
      where memberships.user_id = vendor_users.id
        and memberships.vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
        and memberships.active
    )
    or (select private.has_platform_admin_session())
  );

create policy chapega_users_platform_write
  on private.vendor_users
  for all
  to chapega_app
  using ((select private.has_platform_admin_session()))
  with check ((select private.has_platform_admin_session()));

create policy chapega_memberships_select
  on private.vendor_memberships
  for select
  to chapega_app
  using (
    vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
    or (select private.has_platform_admin_session())
  );

create policy chapega_memberships_platform_write
  on private.vendor_memberships
  for all
  to chapega_app
  using ((select private.has_platform_admin_session()))
  with check ((select private.has_platform_admin_session()));

create policy chapega_sessions_select_delete
  on private.vendor_sessions
  for select
  to chapega_app
  using (
    id_hash = nullif(current_setting('app.session_hash', true), '')
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
    or (
      active_vendor_id = nullif(current_setting('app.vendor_id', true), '')::uuid
      and session_scope = 'vendor'
    )
    or (select private.has_platform_admin_session())
  );

create policy chapega_sessions_insert
  on private.vendor_sessions
  for insert
  to chapega_app
  with check (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and (
      (
        session_scope = 'vendor'
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

create policy chapega_sessions_delete
  on private.vendor_sessions
  for delete
  to chapega_app
  using (
    id_hash = nullif(current_setting('app.session_hash', true), '')
    or user_id = nullif(current_setting('app.user_id', true), '')::uuid
    or (select private.has_platform_admin_session())
  );

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'app_state',
    'products',
    'product_variants',
    'orders',
    'order_items',
    'order_events',
    'shop_settings',
    'audit_log',
    'import_runs',
    'vendor_assets'
  ]
  loop
    execute format(
      'create policy chapega_tenant_access on private.%I for all to chapega_app '
      || 'using ((vendor_id = nullif(current_setting(''app.vendor_id'', true), '''')::uuid '
      || 'and (select private.current_vendor_is_active())) '
      || 'or (select private.has_platform_admin_session())) '
      || 'with check ((vendor_id = nullif(current_setting(''app.vendor_id'', true), '''')::uuid '
      || 'and (select private.current_vendor_is_active())) '
      || 'or (select private.has_platform_admin_session()))',
      table_name
    );
  end loop;
end
$$;

-- Login throttling is deliberately platform-global and contains no tenant
-- business data. It remains directly available to the restricted runtime role.
create policy chapega_rate_limit_access
  on private.rate_limit_buckets
  for all
  to chapega_app
  using (true)
  with check (true);

-- Future private tables must still opt into an explicit RLS policy.
revoke all privileges on private.vendors, private.vendor_memberships,
  private.vendor_assets from public, anon, authenticated;

commit;
