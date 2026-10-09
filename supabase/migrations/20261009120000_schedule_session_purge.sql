begin;

-- Deletes Studio and admin sessions that expired more than a day ago, every
-- day at 03:15 UTC. Supabase ships pg_cron; a Postgres without it (CI, local)
-- skips the schedule, and private.purge_expired_records() can be run by hand.
-- Order redaction is not scheduled here: its retention period is the shop
-- owner's decision (see docs/RUNBOOK.md).
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron is not available (%); session purge not scheduled.', sqlerrm;
    return;
  end;

  -- Same name again replaces the job, so re-running this is safe.
  perform cron.schedule(
    'chapega-purge-sessions',
    '15 3 * * *',
    'select private.purge_expired_records()'
  );
end;
$$;

commit;
