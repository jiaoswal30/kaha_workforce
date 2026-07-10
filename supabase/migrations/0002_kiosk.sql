-- ============================================================================
-- Kaha Staff Manager — V2: kiosk attendance (device + PIN + optional photo),
-- complaints channel, GPS removal. Run AFTER 0001_init.sql.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA CHANGES
-- ----------------------------------------------------------------------------

alter table employees add column pin_hash text;

-- Admin toggle: when false the kiosk skips the camera step entirely
-- (for kiosk machines without a webcam).
alter table store_config add column require_photo boolean not null default true;

alter table attendance add column check_in_photo text;
alter table attendance add column check_out_photo text;

create table registered_devices (
  id uuid primary key default gen_random_uuid(),
  device_token uuid unique not null default gen_random_uuid(),
  name text not null,
  registered_by uuid references employees(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table pin_attempts (
  employee_id uuid primary key references employees(id) on delete cascade,
  failed_count integer not null default 0,
  locked_until timestamptz
);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  category text not null check (category in ('workplace','schedule','customer_incident','equipment','other')),
  subject text not null,
  status text not null check (status in ('open','in_discussion','resolved')) default 'open',
  created_at timestamptz not null default now()
);

create table complaint_messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references complaints(id) on delete cascade,
  sender_id uuid references employees(id),
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_complaints_employee on complaints (employee_id);
create index idx_complaint_messages_complaint on complaint_messages (complaint_id, created_at);

-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------

alter table registered_devices enable row level security;
alter table pin_attempts enable row level security;
alter table complaints enable row level security;
alter table complaint_messages enable row level security;

-- devices & pin_attempts: admin only (kiosk goes through security-definer RPCs)
create policy "devices_admin" on registered_devices for all
  using (is_admin()) with check (is_admin());
-- no policies on pin_attempts: nobody touches it directly, RPCs only.

-- complaints: private between the raising employee and admin
create policy "complaints_select" on complaints for select
  using (employee_id = auth.uid() or is_admin());
create policy "complaints_insert" on complaints for insert
  with check (employee_id = auth.uid());
create policy "complaints_update" on complaints for update
  using (employee_id = auth.uid() or is_admin());

create policy "complaint_messages_select" on complaint_messages for select
  using (exists (
    select 1 from complaints c
    where c.id = complaint_id and (c.employee_id = auth.uid() or is_admin())
  ));
create policy "complaint_messages_insert" on complaint_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from complaints c
      where c.id = complaint_id and (c.employee_id = auth.uid() or is_admin())
    )
  );

-- ----------------------------------------------------------------------------
-- 3. REMOVE GPS ATTENDANCE
-- ----------------------------------------------------------------------------

drop function if exists check_in(decimal, decimal);
drop function if exists check_out(decimal, decimal);

-- ----------------------------------------------------------------------------
-- 4. ADMIN MANAGEMENT RPCS (require an admin session)
-- ----------------------------------------------------------------------------

create function register_device(p_name text)
returns registered_devices
language plpgsql security definer set search_path = public as $$
declare
  v_row registered_devices;
begin
  if not is_admin() then
    raise exception 'Admin only.';
  end if;
  insert into registered_devices (name, registered_by)
  values (p_name, auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

create function revoke_device(p_device_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Admin only.';
  end if;
  update registered_devices set is_active = false where id = p_device_id;
end;
$$;

-- search_path includes `extensions` because Supabase installs pgcrypto
-- (crypt / gen_salt) there, not in public.
create function set_employee_pin(p_employee_id uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin() then
    raise exception 'Admin only.';
  end if;
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits.';
  end if;
  update employees set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_employee_id;
  delete from pin_attempts where employee_id = p_employee_id;
end;
$$;

create function set_require_photo(p_value boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Admin only.';
  end if;
  update store_config set require_photo = p_value;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. KIOSK RPCS (no auth session — the device token IS the credential;
--    callable by the anon role, all validation inside)
-- ----------------------------------------------------------------------------

create function assert_device(p_device_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from registered_devices where device_token = p_device_token and is_active
  ) then
    raise exception 'This device is not registered for attendance.';
  end if;
end;
$$;

-- Roster for the kiosk home screen: names, in/out state, and whether the
-- camera step is required. Never exposes emails, PINs, or photos.
create function kiosk_roster(p_device_token uuid)
returns table (
  employee_id uuid,
  name text,
  checked_in boolean,
  completed boolean,
  check_in_time timestamptz,
  check_out_time timestamptz,
  require_photo boolean
)
language plpgsql security definer set search_path = public as $$
begin
  perform assert_device(p_device_token);
  return query
  select
    e.id,
    e.name,
    (a.check_in_time is not null and a.check_out_time is null),
    (a.check_out_time is not null),
    a.check_in_time,
    a.check_out_time,
    (select sc.require_photo from store_config sc limit 1)
  from employees e
  left join attendance a on a.employee_id = e.id and a.date = current_date
  where e.role = 'employee'
  order by e.name;
end;
$$;

-- Validates PIN with lockout: 3 wrong attempts locks that employee's kiosk
-- actions for 60 seconds.
create function verify_pin(p_employee_id uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
  v_attempt pin_attempts;
begin
  select pin_hash into v_hash from employees where id = p_employee_id;
  if v_hash is null then
    raise exception 'No PIN set for this employee — ask the admin to set one.';
  end if;

  select * into v_attempt from pin_attempts where employee_id = p_employee_id;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    raise exception 'Locked for % more seconds.',
      ceil(extract(epoch from v_attempt.locked_until - now()));
  end if;

  if v_hash = crypt(p_pin, v_hash) then
    delete from pin_attempts where employee_id = p_employee_id;
    return;
  end if;

  insert into pin_attempts (employee_id, failed_count)
  values (p_employee_id, 1)
  on conflict (employee_id) do update set failed_count = pin_attempts.failed_count + 1;

  select * into v_attempt from pin_attempts where employee_id = p_employee_id;
  if v_attempt.failed_count >= 3 then
    update pin_attempts
    set locked_until = now() + interval '60 seconds', failed_count = 0
    where employee_id = p_employee_id;
    raise exception 'Incorrect PIN. Locked for 60 seconds.';
  end if;

  raise exception 'Incorrect PIN — % attempt(s) left.', 3 - v_attempt.failed_count;
end;
$$;

-- Pre-check used by the kiosk UI so a wrong PIN is caught BEFORE the camera
-- step (avoids capturing a photo only to fail). check_in/out re-verify anyway.
create function kiosk_verify_pin(p_device_token uuid, p_employee_id uuid, p_pin text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_device(p_device_token);
  perform verify_pin(p_employee_id, p_pin);
end;
$$;

create function kiosk_check_in(
  p_device_token uuid,
  p_employee_id uuid,
  p_pin text,
  p_photo text default null
)
returns attendance
language plpgsql security definer set search_path = public as $$
declare
  v_config store_config;
  v_now timestamptz := now();
  v_date date := current_date;
  v_dow integer := extract(dow from v_now); -- 0 = sunday
  v_open_time time;
  v_late_cutoff time;
  v_is_late boolean;
  v_row attendance;
begin
  perform assert_device(p_device_token);
  perform verify_pin(p_employee_id, p_pin);

  select * into v_config from store_config limit 1;

  if v_config.require_photo and p_photo is null then
    raise exception 'A photo is required for check-in.';
  end if;

  if exists (
    select 1 from attendance
    where employee_id = p_employee_id and check_in_time is not null and check_out_time is null
  ) then
    raise exception 'You already have an active check-in. Check out first.';
  end if;

  if exists (
    select 1 from attendance
    where employee_id = p_employee_id and date = v_date and check_in_time is not null
  ) then
    raise exception 'You have already checked in today.';
  end if;

  v_open_time := case when v_dow = 0 then v_config.sunday_open_time else v_config.weekday_open_time end;
  v_late_cutoff := v_open_time + make_interval(mins => v_config.late_threshold_minutes);
  v_is_late := v_now::time > v_late_cutoff;

  insert into attendance (employee_id, date, check_in_time, check_in_photo, is_late, is_half_day, status)
  values (
    p_employee_id, v_date, v_now, p_photo, v_is_late, v_is_late,
    case when v_is_late then 'half_day' else 'present' end
  )
  on conflict (employee_id, date) do update set
    check_in_time = excluded.check_in_time,
    check_in_photo = excluded.check_in_photo,
    is_late = excluded.is_late,
    is_half_day = excluded.is_half_day,
    status = excluded.status
  returning * into v_row;

  perform sync_leave_balance(p_employee_id, extract(month from v_date)::int, extract(year from v_date)::int);

  return v_row;
end;
$$;

create function kiosk_check_out(
  p_device_token uuid,
  p_employee_id uuid,
  p_pin text,
  p_photo text default null
)
returns attendance
language plpgsql security definer set search_path = public as $$
declare
  v_config store_config;
  v_row attendance;
begin
  perform assert_device(p_device_token);
  perform verify_pin(p_employee_id, p_pin);

  select * into v_config from store_config limit 1;
  if v_config.require_photo and p_photo is null then
    raise exception 'A photo is required for check-out.';
  end if;

  select * into v_row from attendance
  where employee_id = p_employee_id and check_in_time is not null and check_out_time is null
  order by date desc limit 1;

  if v_row.id is null then
    raise exception 'You have not checked in yet.';
  end if;

  update attendance
  set check_out_time = now(), check_out_photo = p_photo
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- The kiosk RPCs must be callable without a session; everything else that is
-- security definer should NOT be callable by anon. Postgres grants EXECUTE to
-- PUBLIC by default, so explicitly revoke anon from the sensitive ones.
revoke execute on function register_device(text) from anon;
revoke execute on function revoke_device(uuid) from anon;
revoke execute on function set_employee_pin(uuid, text) from anon;
revoke execute on function set_require_photo(boolean) from anon;
revoke execute on function verify_pin(uuid, text) from anon;
revoke execute on function sync_leave_balance(uuid, integer, integer) from anon;
revoke execute on function get_my_leave_balance(integer, integer) from anon;
revoke execute on function get_all_leave_balances(integer, integer) from anon;
revoke execute on function ensure_attendance_status_for_employee(uuid, date) from anon;
revoke execute on function ensure_attendance_status_range(date, date) from anon;
revoke execute on function ensure_my_attendance_status_range(date, date) from anon;
revoke execute on function carry_over_my_todos() from anon;
revoke execute on function set_own_weekly_off_day(text) from anon;
