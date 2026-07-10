-- Fix: Supabase installs pgcrypto in the `extensions` schema, so functions
-- with search_path locked to `public` couldn't find crypt()/gen_salt().
-- Recreates the two PIN functions with `extensions` on the search path.

create extension if not exists pgcrypto with schema extensions;

create or replace function set_employee_pin(p_employee_id uuid, p_pin text)
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

create or replace function verify_pin(p_employee_id uuid, p_pin text)
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

-- keep these locked away from the anon role (as in 0002)
revoke execute on function set_employee_pin(uuid, text) from anon;
revoke execute on function verify_pin(uuid, text) from anon;
