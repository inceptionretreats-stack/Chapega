begin;

alter table private.order_events
  drop constraint if exists order_events_actor_name_check;

alter table private.order_events
  add constraint order_events_actor_name_check check (
    actor_name = btrim(actor_name)
    and char_length(actor_name) between 1 and 96
  );

commit;
