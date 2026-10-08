begin;

-- Removes customer details from finished orders once a retention period has
-- passed. The period is the shop owner's decision, so nothing runs this
-- automatically: the owner schedules it (for example with pg_cron) after
-- choosing the period. Amounts, items and status stay for bookkeeping.
create function private.redact_order_personal_data(older_than interval)
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
      version = version + 1,
      updated_at = now()
  where status in ('completed', 'cancelled')
    and updated_at < now() - older_than
    and (customer_name <> '' or customer_phone <> '' or gift_note <> ''
      or order_note <> '' or whatsapp_url like '%?%');
  get diagnostics redacted = row_count;
  return query select redacted;
end;
$$;

revoke all on function private.redact_order_personal_data(interval)
  from public, anon, authenticated, service_role, chapega_app;

commit;
