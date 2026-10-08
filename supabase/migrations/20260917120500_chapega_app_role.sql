begin;

do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'chapega_app'
  ) then
    create role chapega_app nologin noinherit;
  end if;
end
$$;

grant connect on database postgres to chapega_app;
grant usage on schema private to chapega_app;
grant select, insert, update, delete on all tables in schema private to chapega_app;
grant usage, select on all sequences in schema private to chapega_app;

alter default privileges for role postgres in schema private
  grant select, insert, update, delete on tables to chapega_app;
alter default privileges for role postgres in schema private
  grant usage, select on sequences to chapega_app;

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
    execute format(
      'create policy chapega_app_full_access on private.%I for all to chapega_app using (true) with check (true)',
      table_name
    );
  end loop;
end
$$;

commit;
