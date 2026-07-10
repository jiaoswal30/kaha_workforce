-- Web push notifications: device subscriptions + instant notify on
-- follow-up assignment + daily due-reminder schedule.
--
-- REQUIRES the edge function `notify-followups` to be deployed first
-- (see supabase/functions/notify-followups/ and README "Push notifications").

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  endpoint text unique not null,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "push_subs_own" on push_subscriptions for all
  using (employee_id = auth.uid() or is_admin())
  with check (employee_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- Instant notification when a follow-up is assigned to someone else
-- (self-created follow-ups don't notify — you know you just made it).
-- Uses pg_net to call the edge function asynchronously.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create function notify_new_followup() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.created_by is distinct from new.employee_id then
    perform net.http_post(
      url := 'https://fqyegdcditoqqeqiebqo.supabase.co/functions/v1/notify-followups',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-fn-secret', '03fc81b28fa65ac30f5e46b01b8925c5640a6d1ca3c98de1'
      ),
      body := jsonb_build_object('record', row_to_json(new))
    );
  end if;
  return new;
end;
$$;

create trigger trg_notify_new_followup
  after insert on followups
  for each row execute function notify_new_followup();

-- ---------------------------------------------------------------------------
-- Daily reminder at 11:00 IST (05:30 UTC): everyone with due/overdue
-- follow-ups gets a push summarizing them.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'kaha-followups-daily',
  '30 5 * * *',
  $$
  select net.http_post(
    url := 'https://fqyegdcditoqqeqiebqo.supabase.co/functions/v1/notify-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fn-secret', '03fc81b28fa65ac30f5e46b01b8925c5640a6d1ca3c98de1'
    ),
    body := '{}'::jsonb
  )
  $$
);
