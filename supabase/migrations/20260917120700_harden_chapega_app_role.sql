begin;

alter role chapega_app with
  noinherit
  nocreatedb
  nocreaterole;

do $$
declare
  app_role pg_roles%rowtype;
begin
  select * into strict app_role
  from pg_roles
  where rolname = 'chapega_app';

  if app_role.rolsuper or app_role.rolreplication or app_role.rolbypassrls then
    raise exception 'chapega_app has a forbidden elevated privilege';
  end if;
end
$$;

do $$
declare
  granted_role text;
begin
  for granted_role in
    select parent_roles.rolname
    from pg_auth_members memberships
    join pg_roles member_roles on member_roles.oid = memberships.member
    join pg_roles parent_roles on parent_roles.oid = memberships.roleid
    where member_roles.rolname = 'chapega_app'
  loop
    execute format('revoke %I from chapega_app', granted_role);
  end loop;
end
$$;

commit;
