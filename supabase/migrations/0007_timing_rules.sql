-- Timing rules update:
-- 1. All time comparisons now happen in the store's timezone (Asia/Kolkata).
--    Previously they ran in UTC, which made the late logic wrong by 5.5h.
-- 2. Late bands tightened: on time <= opening; late threshold now 10 minutes
--    after opening (11:10 Mon-Sat, 12:10 Sun) -> beyond that = half day.
-- 3. Checking out before the checkout cutoff (19:30) also marks a half day.

alter table store_config add column checkout_cutoff time not null default '19:30';
alter table store_config add column timezone text not null default 'Asia/Kolkata';
update store_config set late_threshold_minutes = 10;

create or replace function kiosk_check_in(
  p_device_token uuid,
  p_employee_id uuid,
  p_pin text,
  p_photo text default null
)
returns attendance
language plpgsql security definer set search_path = public as $$
declare
  v_config store_config;
  v_local timestamp;
  v_date date;
  v_dow integer;
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

  v_local := now() at time zone v_config.timezone;
  v_date := v_local::date;
  v_dow := extract(dow from v_local); -- 0 = sunday

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
  v_is_late := v_local::time > v_open_time;

  insert into attendance (employee_id, date, check_in_time, check_in_photo, is_late, is_half_day, status)
  values (
    p_employee_id, v_date, now(), p_photo, v_is_late,
    v_local::time > v_late_cutoff,
    case when v_local::time > v_late_cutoff then 'half_day' else 'present' end
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

create or replace function kiosk_check_out(
  p_device_token uuid,
  p_employee_id uuid,
  p_pin text,
  p_photo text default null
)
returns attendance
language plpgsql security definer set search_path = public as $$
declare
  v_config store_config;
  v_local_time time;
  v_left_early boolean;
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

  v_local_time := (now() at time zone v_config.timezone)::time;
  v_left_early := v_local_time < v_config.checkout_cutoff;

  update attendance
  set check_out_time = now(),
      check_out_photo = p_photo,
      is_half_day = attendance.is_half_day or v_left_early,
      status = case
        when attendance.is_half_day or v_left_early then 'half_day'
        else attendance.status
      end
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;
