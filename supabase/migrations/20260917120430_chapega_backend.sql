begin;

create schema if not exists private;

-- A single row coordinates optimistic writes made through the repository.
create table if not exists private.app_state (
  id smallint primary key,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint app_state_singleton_check check (id = 1),
  constraint app_state_revision_check check (revision > 0)
);

create table if not exists private.vendor_users (
  id uuid primary key,
  email text not null,
  name text not null,
  role text not null,
  password_salt text not null,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint vendor_users_email_check check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 160
    and position('@' in email) > 1
  ),
  constraint vendor_users_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80
  ),
  constraint vendor_users_role_check check (role in ('owner', 'manager', 'staff')),
  constraint vendor_users_password_salt_check check (
    password_salt = btrim(password_salt)
    and char_length(password_salt) between 16 and 512
  ),
  constraint vendor_users_password_hash_check check (
    password_hash = btrim(password_hash)
    and char_length(password_hash) between 32 and 512
  )
);

create unique index if not exists vendor_users_email_lower_key
  on private.vendor_users ((lower(email)));

create index if not exists vendor_users_active_role_idx
  on private.vendor_users (role, created_at desc)
  where active;

create table if not exists private.vendor_sessions (
  id_hash text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint vendor_sessions_user_id_fkey
    foreign key (user_id)
    references private.vendor_users (id)
    on delete cascade,
  constraint vendor_sessions_id_hash_check check (id_hash ~ '^[0-9a-f]{64}$'),
  constraint vendor_sessions_expiry_check check (expires_at > created_at)
);

create index if not exists vendor_sessions_user_created_at_idx
  on private.vendor_sessions (user_id, created_at desc);

create index if not exists vendor_sessions_expires_at_idx
  on private.vendor_sessions (expires_at);

create table if not exists private.products (
  id text primary key,
  name text not null,
  short_description text not null,
  description text not null,
  category text not null,
  price_paise integer not null,
  compare_at_price_paise integer,
  image text not null,
  stock integer not null,
  featured boolean not null default false,
  tags text[] not null default array[]::text[],
  recipient_tags text[] not null default array[]::text[],
  occasion_tags text[] not null default array[]::text[],
  preparation_time text not null,
  gift_wrap_eligible boolean not null default false,
  visible boolean not null default true,
  archived boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_id_check check (
    char_length(id) between 1 and 140
    and id ~ '^[a-z0-9][a-z0-9-]*$'
  ),
  constraint products_name_check check (
    name = btrim(name) and char_length(name) between 1 and 120
  ),
  constraint products_short_description_check check (
    short_description = btrim(short_description)
    and char_length(short_description) between 1 and 180
  ),
  constraint products_description_check check (
    description = btrim(description)
    and char_length(description) between 1 and 2000
  ),
  constraint products_category_check check (
    category = btrim(category) and char_length(category) between 1 and 80
  ),
  constraint products_price_check check (price_paise between 0 and 100000000),
  constraint products_compare_at_price_check check (
    compare_at_price_paise is null
    or (
      compare_at_price_paise between 0 and 100000000
      and compare_at_price_paise > price_paise
    )
  ),
  constraint products_image_check check (
    image ~ '^/(products|generated-products|vendor-products)/[A-Za-z0-9._-]+[.](png|jpe?g|webp)$'
  ),
  constraint products_stock_check check (stock between 0 and 100000),
  constraint products_tags_check check (
    cardinality(tags) <= 20 and array_position(tags, null) is null
  ),
  constraint products_recipient_tags_check check (
    cardinality(recipient_tags) <= 20 and array_position(recipient_tags, null) is null
  ),
  constraint products_occasion_tags_check check (
    cardinality(occasion_tags) <= 20 and array_position(occasion_tags, null) is null
  ),
  constraint products_preparation_time_check check (
    preparation_time = btrim(preparation_time)
    and char_length(preparation_time) between 1 and 120
  ),
  constraint products_version_check check (version > 0),
  constraint products_timestamps_check check (updated_at >= created_at)
);

create index if not exists products_vendor_updated_at_idx
  on private.products (updated_at desc)
  where not archived;

create index if not exists products_kiosk_category_updated_at_idx
  on private.products (category, updated_at desc)
  where visible and not archived;

create index if not exists products_featured_updated_at_idx
  on private.products (updated_at desc)
  where featured and visible and not archived;

create table if not exists private.product_variants (
  product_id text not null,
  id text not null,
  position smallint not null,
  name text not null,
  price_adjustment_paise integer not null default 0,
  stock integer,
  constraint product_variants_pkey primary key (product_id, id),
  constraint product_variants_product_id_fkey
    foreign key (product_id)
    references private.products (id)
    on delete cascade,
  constraint product_variants_id_check check (
    id = btrim(id) and char_length(id) between 1 and 100
  ),
  constraint product_variants_position_check check (position >= 0),
  constraint product_variants_name_check check (
    name = btrim(name) and char_length(name) between 1 and 120
  ),
  constraint product_variants_price_adjustment_check check (
    price_adjustment_paise between -100000000 and 100000000
  ),
  constraint product_variants_stock_check check (
    stock is null or stock between 0 and 100000
  ),
  constraint product_variants_product_position_key unique (product_id, position)
);

create table if not exists private.orders (
  id uuid primary key,
  order_number text not null,
  idempotency_key text not null,
  submission_fingerprint text not null,
  customer_name text not null default '',
  customer_phone text not null default '',
  gift_note text not null default '',
  order_note text not null default '',
  kiosk_name text not null,
  payment_method text not null default 'pay_later',
  subtotal_paise integer not null,
  gift_wrap_paise integer not null,
  total_paise integer not null,
  whatsapp_message text not null,
  whatsapp_url text not null,
  status text not null default 'prepared',
  version integer not null default 1,
  inventory_committed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_order_number_key unique (order_number),
  constraint orders_idempotency_key_key unique (idempotency_key),
  constraint orders_order_number_check check (
    char_length(order_number) <= 40
    and order_number ~ '^GFT-[0-9]{8}-[0-9]{4}$'
  ),
  constraint orders_idempotency_key_check check (
    idempotency_key = btrim(idempotency_key)
    and char_length(idempotency_key) between 1 and 100
  ),
  constraint orders_submission_fingerprint_check check (
    submission_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint orders_customer_name_check check (
    customer_name = btrim(customer_name) and char_length(customer_name) <= 80
  ),
  constraint orders_customer_phone_check check (
    customer_phone = btrim(customer_phone) and char_length(customer_phone) <= 30
  ),
  constraint orders_gift_note_check check (
    gift_note = btrim(gift_note) and char_length(gift_note) <= 240
  ),
  constraint orders_order_note_check check (
    order_note = btrim(order_note) and char_length(order_note) <= 240
  ),
  constraint orders_kiosk_name_check check (
    kiosk_name = btrim(kiosk_name) and char_length(kiosk_name) between 1 and 80
  ),
  constraint orders_payment_method_check check (payment_method = 'pay_later'),
  constraint orders_subtotal_check check (subtotal_paise between 0 and 1000000000),
  constraint orders_gift_wrap_check check (gift_wrap_paise between 0 and 1000000000),
  constraint orders_total_check check (
    total_paise between 0 and 1000000000
    and total_paise = subtotal_paise + gift_wrap_paise
  ),
  constraint orders_whatsapp_message_check check (char_length(whatsapp_message) > 0),
  constraint orders_whatsapp_url_check check (
    char_length(whatsapp_url) > 0 and whatsapp_url like 'https://wa.me/%'
  ),
  constraint orders_status_check check (
    status in ('prepared', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')
  ),
  constraint orders_version_check check (version > 0),
  constraint orders_inventory_state_check check (
    (status in ('prepared', 'cancelled') and not inventory_committed)
    or (status in ('confirmed', 'preparing', 'ready', 'completed') and inventory_committed)
  ),
  constraint orders_timestamps_check check (updated_at >= created_at)
);

create index if not exists orders_created_at_idx
  on private.orders (created_at desc);

create index if not exists orders_status_created_at_idx
  on private.orders (status, created_at desc);

create index if not exists orders_active_created_at_idx
  on private.orders (created_at desc)
  where status not in ('completed', 'cancelled');

create table if not exists private.order_items (
  order_id uuid not null,
  position smallint not null,
  product_id text not null,
  name text not null,
  image text not null,
  variant_id text,
  variant_name text,
  quantity smallint not null,
  unit_price_paise integer not null,
  gift_wrapped boolean not null default false,
  line_total_paise integer not null,
  constraint order_items_pkey primary key (order_id, position),
  constraint order_items_order_id_fkey
    foreign key (order_id)
    references private.orders (id)
    on delete cascade,
  constraint order_items_position_check check (position >= 0),
  constraint order_items_product_id_check check (
    product_id = btrim(product_id) and char_length(product_id) between 1 and 140
  ),
  constraint order_items_name_check check (
    name = btrim(name) and char_length(name) between 1 and 120
  ),
  constraint order_items_image_check check (
    image ~ '^/(products|generated-products|vendor-products)/[A-Za-z0-9._-]+[.](png|jpe?g|webp)$'
  ),
  constraint order_items_variant_pair_check check (
    (variant_id is null and variant_name is null)
    or (
      variant_id is not null
      and variant_name is not null
      and variant_id = btrim(variant_id)
      and char_length(variant_id) between 1 and 100
      and variant_name = btrim(variant_name)
      and char_length(variant_name) between 1 and 120
    )
  ),
  constraint order_items_quantity_check check (quantity between 1 and 5),
  constraint order_items_unit_price_check check (
    unit_price_paise between 0 and 100000000
  ),
  constraint order_items_line_total_check check (
    line_total_paise between 0 and 500000000
    and line_total_paise = quantity::integer * unit_price_paise
  )
);

create index if not exists order_items_product_order_idx
  on private.order_items (product_id, order_id);

create table if not exists private.order_events (
  id uuid primary key,
  order_id uuid not null,
  from_status text,
  to_status text not null,
  actor_name text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint order_events_order_id_fkey
    foreign key (order_id)
    references private.orders (id)
    on delete cascade,
  constraint order_events_from_status_check check (
    from_status is null
    or from_status in ('prepared', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')
  ),
  constraint order_events_to_status_check check (
    to_status in ('prepared', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')
  ),
  constraint order_events_transition_check check (
    from_status is null or from_status <> to_status
  ),
  constraint order_events_actor_name_check check (
    actor_name = btrim(actor_name) and char_length(actor_name) between 1 and 96
  ),
  constraint order_events_note_check check (
    note is null or (note = btrim(note) and char_length(note) between 1 and 240)
  )
);

create index if not exists order_events_order_created_at_idx
  on private.order_events (order_id, created_at, id);

create table if not exists private.shop_settings (
  id smallint primary key,
  shop_name text not null,
  owner_whatsapp_number text not null,
  default_country_code text not null,
  kiosk_name text not null,
  max_cart_quantity smallint not null,
  gift_wrap_fee_paise integer not null,
  qr_reset_seconds integer not null,
  show_preview_label boolean not null default false,
  store_open boolean not null default true,
  low_stock_threshold integer not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint shop_settings_singleton_check check (id = 1),
  constraint shop_settings_shop_name_check check (
    shop_name = btrim(shop_name) and char_length(shop_name) between 1 and 80
  ),
  constraint shop_settings_whatsapp_number_check check (
    owner_whatsapp_number ~ '^[1-9][0-9]{7,23}$'
  ),
  constraint shop_settings_country_code_check check (
    default_country_code ~ '^[1-9][0-9]{0,2}$'
  ),
  constraint shop_settings_kiosk_name_check check (
    kiosk_name = btrim(kiosk_name) and char_length(kiosk_name) between 1 and 80
  ),
  constraint shop_settings_cart_quantity_check check (max_cart_quantity between 1 and 5),
  constraint shop_settings_gift_wrap_fee_check check (
    gift_wrap_fee_paise between 0 and 100000
  ),
  constraint shop_settings_qr_reset_check check (qr_reset_seconds between 15 and 3600),
  constraint shop_settings_low_stock_check check (low_stock_threshold between 0 and 999),
  constraint shop_settings_version_check check (version > 0)
);

create table if not exists private.audit_log (
  id uuid primary key,
  actor_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  created_at timestamptz not null default now(),
  constraint audit_log_actor_id_check check (
    actor_id = btrim(actor_id) and char_length(actor_id) between 1 and 160
  ),
  constraint audit_log_action_check check (
    action = btrim(action) and char_length(action) between 1 and 120
  ),
  constraint audit_log_entity_type_check check (
    entity_type in ('auth', 'product', 'order', 'settings')
  ),
  constraint audit_log_entity_id_check check (
    entity_id = btrim(entity_id) and char_length(entity_id) between 1 and 200
  )
);

create index if not exists audit_log_entity_created_at_idx
  on private.audit_log (entity_type, entity_id, created_at desc);

create index if not exists audit_log_actor_created_at_idx
  on private.audit_log (actor_id, created_at desc);

create table if not exists private.rate_limit_buckets (
  bucket text primary key,
  attempt_count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint rate_limit_buckets_bucket_check check (
    bucket = btrim(bucket) and char_length(bucket) between 1 and 300
  ),
  constraint rate_limit_buckets_attempt_count_check check (attempt_count >= 0)
);

create index if not exists rate_limit_buckets_reset_at_idx
  on private.rate_limit_buckets (reset_at);

create table if not exists private.import_runs (
  id bigint generated by default as identity primary key,
  source_name text not null,
  source_checksum text not null,
  source_version integer not null,
  status text not null default 'pending',
  row_counts jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint import_runs_source_checksum_key unique (source_checksum),
  constraint import_runs_source_name_check check (
    source_name = btrim(source_name) and char_length(source_name) between 1 and 240
  ),
  constraint import_runs_source_checksum_check check (
    source_checksum ~ '^[0-9a-f]{64}$'
  ),
  constraint import_runs_source_version_check check (source_version > 0),
  constraint import_runs_status_check check (
    status in ('pending', 'running', 'completed', 'failed')
  ),
  constraint import_runs_row_counts_check check (jsonb_typeof(row_counts) = 'object'),
  constraint import_runs_error_message_check check (
    error_message is null
    or (error_message = btrim(error_message) and char_length(error_message) between 1 and 4000)
  ),
  constraint import_runs_completion_check check (
    (status in ('pending', 'running') and completed_at is null)
    or (
      status in ('completed', 'failed')
      and completed_at is not null
      and completed_at >= started_at
    )
  )
);

create index if not exists import_runs_status_started_at_idx
  on private.import_runs (status, started_at desc);

insert into private.app_state (id, revision)
values (1, 1)
on conflict (id) do nothing;

insert into private.shop_settings (
  id,
  shop_name,
  owner_whatsapp_number,
  default_country_code,
  kiosk_name,
  max_cart_quantity,
  gift_wrap_fee_paise,
  qr_reset_seconds,
  show_preview_label,
  store_open,
  low_stock_threshold,
  version
)
values (
  1,
  'Chapega.com',
  '919876543210',
  '91',
  'Main Entrance',
  5,
  2500,
  120,
  false,
  true,
  3,
  1
)
on conflict (id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'vendor-products',
  'vendor-products',
  true,
  8388608,
  array['image/png', 'image/jpeg']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Defense in depth: private tables remain inaccessible even if the schema is
-- accidentally added to the Data API's exposed schemas later.
alter table private.app_state enable row level security;
alter table private.app_state force row level security;
alter table private.vendor_users enable row level security;
alter table private.vendor_users force row level security;
alter table private.vendor_sessions enable row level security;
alter table private.vendor_sessions force row level security;
alter table private.products enable row level security;
alter table private.products force row level security;
alter table private.product_variants enable row level security;
alter table private.product_variants force row level security;
alter table private.orders enable row level security;
alter table private.orders force row level security;
alter table private.order_items enable row level security;
alter table private.order_items force row level security;
alter table private.order_events enable row level security;
alter table private.order_events force row level security;
alter table private.shop_settings enable row level security;
alter table private.shop_settings force row level security;
alter table private.audit_log enable row level security;
alter table private.audit_log force row level security;
alter table private.rate_limit_buckets enable row level security;
alter table private.rate_limit_buckets force row level security;
alter table private.import_runs enable row level security;
alter table private.import_runs force row level security;

revoke all privileges on schema private from public, anon, authenticated;
revoke all privileges on all tables in schema private from public, anon, authenticated;
revoke all privileges on all sequences in schema private from public, anon, authenticated;
revoke all privileges on all functions in schema private from public, anon, authenticated;

alter default privileges for role postgres in schema private
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all privileges on functions from public, anon, authenticated;

commit;
