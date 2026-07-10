-- Change stock verification from random assignment to self-volunteering:
-- after a count is submitted, any OTHER employee claims the verification by
-- clicking a button (first click wins). Both names stay on the record.

-- Submit no longer picks an approver; the tally waits for a volunteer.
-- (Still auto-approves in the degenerate case where no other employee exists.)
create or replace function submit_stock_tally(p_items jsonb)
returns stock_tallies
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone (select timezone from store_config limit 1))::date;
  v_existing stock_tallies;
  v_tally stock_tallies;
  v_item jsonb;
  v_reason jsonb;
  v_category uuid;
  v_counted integer;
  v_expected integer;
  v_variance integer;
  v_reason_sum integer;
  v_count_id uuid;
  v_others integer;
  v_cat_name text;
begin
  select * into v_existing from stock_tallies where date = v_today;
  if v_existing.id is not null then
    if v_existing.status = 'rejected' then
      delete from stock_tallies where id = v_existing.id; -- resubmission replaces
    else
      raise exception 'Today''s stock tally is already %.',
        case v_existing.status when 'approved' then 'approved' else 'submitted and waiting for verification' end;
    end if;
  end if;

  select count(*) into v_others from employees where role = 'employee' and id <> auth.uid();

  insert into stock_tallies (date, submitted_by, approver_id, status, approved_at)
  values (
    v_today, auth.uid(), null,
    case when v_others = 0 then 'approved' else 'pending_approval' end,
    case when v_others = 0 then now() else null end
  )
  returning * into v_tally;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_category := (v_item->>'category_id')::uuid;
    v_counted := (v_item->>'counted')::integer;

    select e.expected into v_expected from get_stock_expected() e where e.category_id = v_category;
    v_variance := case when v_expected is null then 0 else v_counted - v_expected end;

    select coalesce(sum((r->>'quantity')::integer), 0) into v_reason_sum
    from jsonb_array_elements(coalesce(v_item->'reasons', '[]'::jsonb)) r;

    if abs(v_variance) <> v_reason_sum then
      select name into v_cat_name from stock_categories where id = v_category;
      raise exception '%: difference of % piece(s) but reasons cover % — every piece must be accounted for.',
        v_cat_name, abs(v_variance), v_reason_sum;
    end if;

    insert into stock_counts (tally_id, category_id, expected, counted)
    values (v_tally.id, v_category, v_expected, v_counted)
    returning id into v_count_id;

    for v_reason in select * from jsonb_array_elements(coalesce(v_item->'reasons', '[]'::jsonb)) loop
      insert into stock_reasons (count_id, reason, quantity, note)
      values (v_count_id, v_reason->>'reason', (v_reason->>'quantity')::integer, nullif(v_reason->>'note', ''));
    end loop;
  end loop;

  return v_tally;
end;
$$;

-- A teammate volunteers to verify. First click wins; the counter themselves
-- cannot claim their own tally.
create function claim_stock_verification(p_tally_id uuid)
returns stock_tallies
language plpgsql security definer set search_path = public as $$
declare
  v_tally stock_tallies;
begin
  select * into v_tally from stock_tallies where id = p_tally_id for update;
  if v_tally.id is null then
    raise exception 'Tally not found.';
  end if;
  if v_tally.status <> 'pending_approval' then
    raise exception 'This tally has already been decided.';
  end if;
  if v_tally.approver_id is not null then
    raise exception 'Someone already volunteered to verify this tally.';
  end if;
  if v_tally.submitted_by = auth.uid() then
    raise exception 'You counted this stock — a different employee must verify it.';
  end if;

  update stock_tallies set approver_id = auth.uid() where id = p_tally_id
  returning * into v_tally;

  return v_tally;
end;
$$;

revoke execute on function claim_stock_verification(uuid) from anon;
