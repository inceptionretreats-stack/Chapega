begin;

-- Retention decided by the owner on 2026-10-30: customer details are kept for
-- 30 days. The privacy notice states this rule, and domain/order-privacy.ts
-- applies the same rule to the local store.
--
-- Changes from 20261008122000:
--   * Never-confirmed 'prepared' drafts are cleared 30 days after they were
--     prepared. Before, only finished orders were, so a draft the customer
--     never sent kept their details forever. Orders still in progress keep
--     them until they finish.
--   * submission_fingerprint is replaced: it is sha256 of the customer details
--     and items, so for an order with only a phone number it could be reversed
--     to that number.
--   * updated_at is left alone, so the admin "Last activity" stays honest; the
--     version still moves so an open Studio screen refreshes.
create or replace function private.redact_order_personal_data(older_than interval)
returns table (orders_redacted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  redacted bigint;
begin
  if older_than is null or older_than < interval '30 days' then
    raise exception 'Refusing to redact orders finished less than 30 days ago.'
      using errcode = '22023';
  end if;

  update private.orders
  set customer_name = '',
      customer_phone = '',
      gift_note = '',
      order_note = '',
      whatsapp_message = 'Customer details removed after the retention period.',
      whatsapp_url = regexp_replace(whatsapp_url, '\?.*$', ''),
      submission_fingerprint = encode(sha256(convert_to('redacted:' || id::text, 'UTF8')), 'hex'),
      version = version + 1
  where (
      (status in ('completed', 'cancelled') and updated_at < now() - older_than)
      or (status = 'prepared' and created_at < now() - older_than)
    )
    and (customer_name <> '' or customer_phone <> '' or gift_note <> ''
      or order_note <> '' or whatsapp_url like '%?%');
  get diagnostics redacted = row_count;
  return query select redacted;
end;
$$;

revoke all on function private.redact_order_personal_data(interval)
  from public, anon, authenticated, service_role, chapega_app;

-- Every day at 03:45 UTC, after the session purge. A Postgres without pg_cron
-- (CI, local) skips the schedule; run the function by hand there.
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron is not available (%); order redaction not scheduled.', sqlerrm;
    return;
  end;

  -- Same name again replaces the job, so re-running this is safe.
  perform cron.schedule(
    'chapega-redact-orders',
    '45 3 * * *',
    'select private.redact_order_personal_data(interval ''30 days'')'
  );
end;
$$;

commit;
