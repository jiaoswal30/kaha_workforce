-- ============================================================================
-- Kaha Staff Manager — initial schema, RLS policies, and business-logic
-- functions. Run this once against a fresh Supabase project (SQL Editor or
-- `supabase db push`). See README.md for the one-time setup steps (creating
-- the first admin/employee auth users).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

create table employees (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text unique not null,
  role text not null check (role in ('admin', 'employee')) default 'employee',
  weekly_off_day text check (weekly_off_day in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  created_at timestamptz not null default now()
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  check_in_time timestamptz,
  check_in_lat decimal,
  check_in_lng decimal,
  check_out_time timestamptz,
  check_out_lat decimal,
  check_out_lng decimal,
  is_late boolean not null default false,
  is_half_day boolean not null default false,
  status text check (status in ('present', 'half_day', 'absent', 'week_off', 'paid_leave', 'unpaid_leave')),
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

create table leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null,
  paid_leaves_entitled integer not null default 1,
  paid_leaves_used integer not null default 0,
  carried_deduction integer not null default 0,
  -- internal bookkeeping for the 5-week-month carry-forward rule (see
  -- sync_leave_balance below) — not part of the original spec schema but
  -- needed so the calculation is idempotent across repeated syncs.
  fifth_week_off_consumed boolean not null default false,
  deficit_carried_to_next_month integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (employee_id, month, year)
);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  requested_date date not null,
  leave_type text not null check (leave_type in ('paid_leave', 'unpaid_leave')),
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  admin_note text,
  created_at timestamptz not null default now()
);

create table todos (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null default current_date,
  title text not null,
  description text,
  status text not null check (status in ('pending', 'in_progress', 'done')) default 'pending',
  completed_at timestamptz,
  carried_from date,
  carried boolean not null default false,
  admin_comment text,
  created_at timestamptz not null default now()
);

create table weekly_goals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  week_start date not null,
  title text not null,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table daily_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null default current_date,
  customers_handled integer,
  key_activities text,
  sales_notes text,
  issues text,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

create table inventory_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  note text not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  created_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create table announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (announcement_id, employee_id)
);

create table store_config (
  id uuid primary key default gen_random_uuid(),
  store_name text not null default 'Kaha',
  latitude decimal not null,
  longitude decimal not null,
  radius_meters integer not null default 100,
  weekday_open_time time not null default '11:00',
  sunday_open_time time not null default '12:00',
  late_threshold_minutes integer not null default 15
);

create index idx_attendance_employee_date on attendance (employee_id, date);
create index idx_leave_requests_date on leave_requests (requested_date);
create index idx_todos_employee_date on todos (employee_id, date);
create index idx_weekly_goals_employee_week on weekly_goals (employee_id, week_start);
create index idx_daily_logs_date on daily_logs (date);
create index idx_announcement_reads_employee on announcement_reads (employee_id);

-- ----------------------------------------------------------------------------
-- 2. HELPERS
-- ----------------------------------------------------------------------------

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from employees where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-create the employees row when an auth user is created. Set the role,
-- name, and weekly_off_day via the "Add User" > User Metadata JSON field in
-- the Supabase dashboard, e.g. {"name":"Priya","role":"employee","weekly_off_day":"monday"}.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.employees (id, name, email, role, weekly_off_day)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'employee'),
    new.raw_user_meta_data->>'weekly_off_day'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Haversine distance in meters between two lat/lng points.
create function distance_meters(lat1 decimal, lng1 decimal, lat2 decimal, lng2 decimal)
returns decimal language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  ));
$$;

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table employees enable row level security;
alter table attendance enable row level security;
alter table leave_balances enable row level security;
alter table leave_requests enable row level security;
alter table todos enable row level security;
alter table weekly_goals enable row level security;
alter table daily_logs enable row level security;
alter table inventory_notes enable row level security;
alter table announcements enable row level security;
alter table announcement_reads enable row level security;
alter table store_config enable row level security;

-- employees
create policy "employees_select" on employees for select
  using (id = auth.uid() or is_admin());
create policy "employees_update_admin" on employees for update
  using (is_admin());

-- attendance: employees read their own rows; mutations happen through the
-- check_in/check_out RPCs below (security definer) so admins can also
-- correct entries directly.
create policy "attendance_select" on attendance for select
  using (employee_id = auth.uid() or is_admin());
create policy "attendance_admin_write" on attendance for all
  using (is_admin()) with check (is_admin());

-- leave_balances: read own; only admins write directly (manual adjustments).
-- Automatic syncing goes through sync_leave_balance() (security definer).
create policy "leave_balances_select" on leave_balances for select
  using (employee_id = auth.uid() or is_admin());
create policy "leave_balances_admin_write" on leave_balances for all
  using (is_admin()) with check (is_admin());

-- leave_requests: employees create/read their own; admin reads/updates all.
-- Conflict validation happens in the before-insert trigger below.
create policy "leave_requests_select" on leave_requests for select
  using (employee_id = auth.uid() or is_admin());
create policy "leave_requests_insert" on leave_requests for insert
  with check (employee_id = auth.uid() or is_admin());
create policy "leave_requests_update_admin" on leave_requests for update
  using (is_admin());

-- todos: employees manage their own; admin can read/write all (to add tasks
-- or leave comments on any employee's list).
create policy "todos_select" on todos for select
  using (employee_id = auth.uid() or is_admin());
create policy "todos_insert" on todos for insert
  with check (employee_id = auth.uid() or is_admin());
create policy "todos_update" on todos for update
  using (employee_id = auth.uid() or is_admin());
create policy "todos_delete" on todos for delete
  using (employee_id = auth.uid() or is_admin());

-- weekly_goals: same shape as todos.
create policy "weekly_goals_select" on weekly_goals for select
  using (employee_id = auth.uid() or is_admin());
create policy "weekly_goals_insert" on weekly_goals for insert
  with check (employee_id = auth.uid() or is_admin());
create policy "weekly_goals_update" on weekly_goals for update
  using (employee_id = auth.uid() or is_admin());
create policy "weekly_goals_delete" on weekly_goals for delete
  using (employee_id = auth.uid() or is_admin());

-- daily_logs: employees write their own; admin reads all.
create policy "daily_logs_select" on daily_logs for select
  using (employee_id = auth.uid() or is_admin());
create policy "daily_logs_insert" on daily_logs for insert
  with check (employee_id = auth.uid());
create policy "daily_logs_update" on daily_logs for update
  using (employee_id = auth.uid());

-- inventory_notes: any employee can post; everyone reads; only admin resolves.
create policy "inventory_notes_select" on inventory_notes for select
  using (auth.uid() is not null);
create policy "inventory_notes_insert" on inventory_notes for insert
  with check (employee_id = auth.uid());
create policy "inventory_notes_update_admin" on inventory_notes for update
  using (is_admin());

-- announcements: admin posts; everyone reads.
create policy "announcements_select" on announcements for select
  using (auth.uid() is not null);
create policy "announcements_insert_admin" on announcements for insert
  with check (is_admin());

-- announcement_reads: employees mark their own reads.
create policy "announcement_reads_select" on announcement_reads for select
  using (employee_id = auth.uid() or is_admin());
create policy "announcement_reads_insert" on announcement_reads for insert
  with check (employee_id = auth.uid());

-- store_config: everyone reads (needed client-side for distance display);
-- only admin edits.
create policy "store_config_select" on store_config for select
  using (auth.uid() is not null);
create policy "store_config_admin_write" on store_config for all
  using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- 4. ATTENDANCE: check-in / check-out
-- ----------------------------------------------------------------------------

create function check_in(p_lat decimal, p_lng decimal)
returns attendance
language plpgsql security definer set search_path = public as $$
declare
  v_employee_id uuid := auth.uid();
  v_config store_config;
  v_distance decimal;
  v_now timestamptz := now();
  v_date date := current_date;
  v_dow integer := extract(dow from v_now); -- 0 = sunday
  v_open_time time;
  v_late_cutoff time;
  v_is_late boolean;
  v_row attendance;
begin
  select * into v_config from store_config limit 1;
  if v_config is null then
    raise exception 'Store location is not configured yet. Ask an admin to set it up.';
  end if;

  v_distance := distance_meters(p_lat, p_lng, v_config.latitude, v_config.longitude);
  if v_distance > v_config.radius_meters then
    raise exception 'You are not at the store location (% m away, must be within % m).',
      round(v_distance), v_config.radius_meters;
  end if;

  if exists (
    select 1 from attendance
    where employee_id = v_employee_id and check_in_time is not null and check_out_time is null
  ) then
    raise exception 'You already have an active check-in. Check out first.';
  end if;

  if exists (
    select 1 from attendance where employee_id = v_employee_id and date = v_date and check_in_time is not null
  ) then
    raise exception 'You have already checked in today.';
  end if;

  v_open_time := case when v_dow = 0 then v_config.sunday_open_time else v_config.weekday_open_time end;
  v_late_cutoff := v_open_time + make_interval(mins => v_config.late_threshold_minutes);
  v_is_late := v_now::time > v_late_cutoff;

  insert into attendance (employee_id, date, check_in_time, check_in_lat, check_in_lng, is_late, is_half_day, status)
  values (v_employee_id, v_date, v_now, p_lat, p_lng, v_is_late, v_is_late, case when v_is_late then 'half_day' else 'present' end)
  on conflict (employee_id, date) do update set
    check_in_time = excluded.check_in_time,
    check_in_lat = excluded.check_in_lat,
    check_in_lng = excluded.check_in_lng,
    is_late = excluded.is_late,
    is_half_day = excluded.is_half_day,
    status = excluded.status
  returning * into v_row;

  perform sync_leave_balance(v_employee_id, extract(month from v_date)::int, extract(year from v_date)::int);

  return v_row;
end;
$$;

create function check_out(p_lat decimal, p_lng decimal)
returns attendance
language plpgsql security definer set search_path = public as $$
declare
  v_employee_id uuid := auth.uid();
  v_row attendance;
begin
  select * into v_row from attendance
  where employee_id = v_employee_id and check_in_time is not null and check_out_time is null
  order by date desc limit 1;

  if v_row.id is null then
    raise exception 'You have not checked in yet.';
  end if;

  update attendance
  set check_out_time = now(), check_out_lat = p_lat, check_out_lng = p_lng
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create function set_own_weekly_off_day(p_day text)
returns employees
language plpgsql security definer set search_path = public as $$
declare
  v_row employees;
begin
  update employees set weekly_off_day = p_day where id = auth.uid() returning * into v_row;
  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. LEAVE BALANCE SYNC (monthly entitlement + 5-week carry-forward)
-- ----------------------------------------------------------------------------

-- Counts how many times `p_day` (e.g. 'monday') falls within the given
-- month/year — i.e. how many week-offs that employee gets that month.
create function weekday_occurrences(p_day text, p_month integer, p_year integer)
returns integer language sql immutable as $$
  select count(*)::int
  from generate_series(
    make_date(p_year, p_month, 1),
    (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date,
    interval '1 day'
  ) as d
  where trim(lower(to_char(d, 'day'))) = trim(lower(p_day));
$$;

-- Creates (or refreshes) the leave_balances row for one employee/month,
-- applying the 5-week-month rule: a 5th weekly off in a month auto-consumes
-- that month's paid leave if unused; if the paid leave was already spent
-- elsewhere, the deficit is recorded so next month starts at 0 available.
create function sync_leave_balance(p_employee_id uuid, p_month integer, p_year integer)
returns leave_balances
language plpgsql security definer set search_path = public as $$
declare
  v_row leave_balances;
  v_employee employees;
  v_prev_month integer := case when p_month = 1 then 12 else p_month - 1 end;
  v_prev_year integer := case when p_month = 1 then p_year - 1 else p_year end;
  v_prev_row leave_balances;
  v_carried integer := 0;
  v_off_count integer := 0;
  v_available integer;
begin
  select * into v_employee from employees where id = p_employee_id;

  select * into v_prev_row from leave_balances
  where employee_id = p_employee_id and month = v_prev_month and year = v_prev_year;
  if v_prev_row.id is not null then
    v_carried := v_prev_row.deficit_carried_to_next_month;
  end if;

  select * into v_row from leave_balances
  where employee_id = p_employee_id and month = p_month and year = p_year;

  if v_row.id is null then
    insert into leave_balances (employee_id, month, year, paid_leaves_entitled, carried_deduction)
    values (p_employee_id, p_month, p_year, 1, v_carried)
    returning * into v_row;
  elsif v_row.carried_deduction is distinct from v_carried then
    update leave_balances set carried_deduction = v_carried where id = v_row.id returning * into v_row;
  end if;

  if v_employee.weekly_off_day is not null then
    v_off_count := weekday_occurrences(v_employee.weekly_off_day, p_month, p_year);
  end if;

  if v_off_count >= 5 and not v_row.fifth_week_off_consumed then
    v_available := v_row.paid_leaves_entitled - v_row.carried_deduction - v_row.paid_leaves_used;
    if v_available > 0 then
      update leave_balances
      set paid_leaves_used = paid_leaves_used + 1, fifth_week_off_consumed = true
      where id = v_row.id
      returning * into v_row;
    else
      update leave_balances
      set deficit_carried_to_next_month = 1, fifth_week_off_consumed = true
      where id = v_row.id
      returning * into v_row;
    end if;
  end if;

  return v_row;
end;
$$;

create function get_my_leave_balance(p_month integer, p_year integer)
returns leave_balances
language sql security definer set search_path = public as $$
  select sync_leave_balance(auth.uid(), p_month, p_year);
$$;

create function get_all_leave_balances(p_month integer, p_year integer)
returns setof leave_balances
language plpgsql security definer set search_path = public as $$
declare
  r employees;
begin
  if not is_admin() then
    raise exception 'Admin only.';
  end if;
  for r in select * from employees where role = 'employee' loop
    return next sync_leave_balance(r.id, p_month, p_year);
  end loop;
  return;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. LEAVE REQUESTS: conflict prevention + approval side-effects
-- ----------------------------------------------------------------------------

-- Number of employees already off (week-off or approved leave) on a date,
-- excluding the given employee.
create function employees_off_count(p_date date, p_exclude_employee uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_dow text := trim(lower(to_char(p_date, 'day')));
  v_count integer;
begin
  select count(*) into v_count from employees e
  where e.id <> p_exclude_employee
    and e.role = 'employee'
    and (
      e.weekly_off_day = v_dow
      or exists (
        select 1 from leave_requests lr
        where lr.employee_id = e.id and lr.requested_date = p_date and lr.status = 'approved'
      )
    );
  return v_count;
end;
$$;

-- Auto-rejects (rather than blocking the insert outright) so the request is
-- still visible to the admin, who can flip it back to 'approved' as an
-- override — matching "reject with a message, but admin can override".
create function check_leave_conflict() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() and new.status = 'pending' then
    if employees_off_count(new.requested_date, new.employee_id) >= 2 then
      new.status := 'rejected';
      new.admin_note := 'Auto-rejected: two employees are already off on this date.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_check_leave_conflict
  before insert on leave_requests
  for each row execute function check_leave_conflict();

-- When a leave request is approved, mark the attendance row for that date
-- and deduct from the monthly paid-leave balance (auto-downgrading to
-- unpaid if no paid leave is available).
create function process_leave_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_month integer := extract(month from new.requested_date)::int;
  v_year integer := extract(year from new.requested_date)::int;
  v_balance leave_balances;
  v_available integer;
  v_final_status text;
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    v_balance := sync_leave_balance(new.employee_id, v_month, v_year);
    v_available := v_balance.paid_leaves_entitled - v_balance.carried_deduction - v_balance.paid_leaves_used;

    if new.leave_type = 'paid_leave' and v_available > 0 then
      update leave_balances set paid_leaves_used = paid_leaves_used + 1 where id = v_balance.id;
      v_final_status := 'paid_leave';
    else
      v_final_status := 'unpaid_leave';
    end if;

    insert into attendance (employee_id, date, status)
    values (new.employee_id, new.requested_date, v_final_status)
    on conflict (employee_id, date) do update set status = excluded.status
    where attendance.check_in_time is null;
  end if;
  return new;
end;
$$;

create trigger trg_process_leave_approval
  after update on leave_requests
  for each row execute function process_leave_approval();

-- ----------------------------------------------------------------------------
-- 7. ATTENDANCE BACKFILL (week-offs + no-show detection for past dates)
-- ----------------------------------------------------------------------------

-- Idempotent: fills in 'week_off' for an employee's fixed day off, and
-- 'absent'/'unpaid_leave' for a past working day with no check-in and no
-- approved leave. Called lazily from the client (on dashboard load) rather
-- than via cron.
create function ensure_attendance_status_for_employee(p_employee_id uuid, p_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r employees;
  v_dow text := trim(lower(to_char(p_date, 'day')));
  v_balance leave_balances;
  v_available integer;
begin
  if p_date >= current_date then
    return;
  end if;
  if exists (select 1 from attendance where employee_id = p_employee_id and date = p_date) then
    return;
  end if;

  select * into r from employees where id = p_employee_id;

  if r.weekly_off_day = v_dow then
    insert into attendance (employee_id, date, status) values (r.id, p_date, 'week_off')
    on conflict (employee_id, date) do nothing;
    return;
  end if;

  v_balance := sync_leave_balance(r.id, extract(month from p_date)::int, extract(year from p_date)::int);
  v_available := v_balance.paid_leaves_entitled - v_balance.carried_deduction - v_balance.paid_leaves_used;

  insert into attendance (employee_id, date, status)
  values (r.id, p_date, case when v_available <= 0 then 'unpaid_leave' else 'absent' end)
  on conflict (employee_id, date) do nothing;
end;
$$;

-- Admin: backfills every employee over a date range (e.g. for the history view).
create function ensure_attendance_status_range(p_start date, p_end date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d date;
  r employees;
begin
  if not is_admin() then
    raise exception 'Admin only.';
  end if;
  for r in select * from employees where role = 'employee' loop
    d := p_start;
    while d <= p_end loop
      perform ensure_attendance_status_for_employee(r.id, d);
      d := d + 1;
    end loop;
  end loop;
end;
$$;

-- Self-service: an employee backfilling their own calendar view.
create function ensure_my_attendance_status_range(p_start date, p_end date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d date;
begin
  d := p_start;
  while d <= p_end loop
    perform ensure_attendance_status_for_employee(auth.uid(), d);
    d := d + 1;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. TASK CARRY-OVER
-- ----------------------------------------------------------------------------

-- Carries yesterday's (and any older) unfinished todos forward to today.
-- Idempotent via the `carried` flag so re-running never duplicates rows.
create function carry_over_my_todos()
returns void
language plpgsql security definer set search_path = public as $$
declare
  t todos;
begin
  for t in
    select * from todos
    where employee_id = auth.uid()
      and date < current_date
      and status in ('pending', 'in_progress')
      and carried = false
  loop
    update todos set carried = true where id = t.id;
    insert into todos (employee_id, date, title, description, status, carried_from)
    values (t.employee_id, current_date, t.title, t.description, 'pending', t.date)
    on conflict do nothing;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. SEED: store configuration (edit lat/lng to the real store location)
-- ----------------------------------------------------------------------------

insert into store_config (store_name, latitude, longitude, radius_meters, weekday_open_time, sunday_open_time, late_threshold_minutes)
values ('Kaha', 12.9716, 77.5946, 100, '11:00', '12:00', 15);
