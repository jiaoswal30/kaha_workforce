-- Face verification: each employee gets an enrolled face "descriptor" (a
-- 128-number fingerprint computed in the browser — no actual photo stored
-- here). At kiosk check-in the captured face is compared against the
-- enrolled descriptor of whoever's PIN was entered; a mismatch is rejected.

alter table employees add column face_descriptor jsonb;

-- Admin enrolls (or re-enrolls) an employee's face from the Team page.
create function set_employee_face(p_employee_id uuid, p_descriptor jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Admin only.';
  end if;
  update employees set face_descriptor = p_descriptor where id = p_employee_id;
end;
$$;

-- The kiosk (registered device, no login) fetches the claimed employee's
-- descriptor to compare against the live camera capture.
create function kiosk_face_descriptor(p_device_token uuid, p_employee_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_descriptor jsonb;
begin
  perform assert_device(p_device_token);
  select face_descriptor into v_descriptor from employees where id = p_employee_id;
  return v_descriptor;
end;
$$;

revoke execute on function set_employee_face(uuid, jsonb) from anon;
