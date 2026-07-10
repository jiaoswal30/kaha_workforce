-- Follow-up handoffs: an employee can pass a pending follow-up to a teammate
-- (too busy, going on leave). The transfer history is kept so the admin sees
-- the full chain of custody (Jia -> Vanita -> Mahi).

create table followup_transfers (
  id uuid primary key default gen_random_uuid(),
  followup_id uuid not null references followups(id) on delete cascade,
  from_employee uuid not null references employees(id),
  to_employee uuid not null references employees(id),
  created_at timestamptz not null default now()
);

create index idx_followup_transfers_followup on followup_transfers (followup_id, created_at);

alter table followup_transfers enable row level security;
create policy "followup_transfers_select" on followup_transfers for select
  using (auth.uid() is not null);
-- writes only through the RPC below.

create extension if not exists pg_net with schema extensions;

create function pass_followup(p_followup_id uuid, p_to uuid)
returns followups
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_f followups;
  v_from_name text;
  v_row followups;
begin
  select * into v_f from followups where id = p_followup_id;
  if v_f.id is null then
    raise exception 'Follow-up not found.';
  end if;
  if v_f.status <> 'pending' then
    raise exception 'Only pending follow-ups can be passed on.';
  end if;
  if v_f.employee_id <> auth.uid() and not is_admin() then
    raise exception 'Only the current owner (or admin) can pass this on.';
  end if;
  if p_to = v_f.employee_id then
    raise exception 'Choose a different employee.';
  end if;
  if not exists (select 1 from employees where id = p_to and role = 'employee') then
    raise exception 'Target employee not found.';
  end if;

  insert into followup_transfers (followup_id, from_employee, to_employee)
  values (p_followup_id, v_f.employee_id, p_to);

  select name into v_from_name from employees where id = v_f.employee_id;

  update followups set employee_id = p_to where id = p_followup_id
  returning * into v_row;

  -- push-notify the new owner (async; harmless if the edge function isn't
  -- deployed yet).
  perform net.http_post(
    url := 'https://fqyegdcditoqqeqiebqo.supabase.co/functions/v1/notify-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fn-secret', '03fc81b28fa65ac30f5e46b01b8925c5640a6d1ca3c98de1'
    ),
    body := jsonb_build_object('record', row_to_json(v_row), 'kind', 'transfer', 'from_name', v_from_name)
  );

  return v_row;
end;
$$;

revoke execute on function pass_followup(uuid, uuid) from anon;
