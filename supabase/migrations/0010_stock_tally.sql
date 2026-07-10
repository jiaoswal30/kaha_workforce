-- Daily stock tally with maker-checker verification:
-- an employee submits end-of-day counts per category; the system compares
-- against the last APPROVED tally (the "system stock"); every discrepancy
-- must be explained item-by-item; a randomly chosen OTHER employee verifies.

create table stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

insert into stock_categories (name, sort) values
  ('Earrings', 1), ('Rings', 2), ('Bracelets', 3), ('Necklaces', 4), ('Pendants', 5);

create table stock_tallies (
  id uuid primary key default gen_random_uuid(),
  date date unique not null,
  status text not null check (status in ('pending_approval', 'approved', 'rejected')) default 'pending_approval',
  submitted_by uuid not null references employees(id),
  approver_id uuid references employees(id),
  approver_note text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table stock_counts (
  id uuid primary key default gen_random_uuid(),
  tally_id uuid not null references stock_tallies(id) on delete cascade,
  category_id uuid not null references stock_categories(id),
  expected integer,          -- null on the first-ever tally (no baseline yet)
  counted integer not null check (counted >= 0),
  unique (tally_id, category_id)
);

create table stock_reasons (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references stock_counts(id) on delete cascade,
  reason text not null check (reason in ('sold', 'memo', 'owner_taken', 'new_stock', 'returned', 'other')),
  quantity integer not null check (quantity > 0),
  note text
);

alter table stock_categories enable row level security;
alter table stock_tallies enable row level security;
alter table stock_counts enable row level security;
alter table stock_reasons enable row level security;

-- Everyone signed in can read (it's shared operational data); all writes go
-- through the security-definer RPCs below, except category management (admin).
create policy "stock_categories_select" on stock_categories for select using (auth.uid() is not null);
create policy "stock_categories_admin" on stock_categories for all using (is_admin()) with check (is_admin());
create policy "stock_tallies_select" on stock_tallies for select using (auth.uid() is not null);
create policy "stock_counts_select" on stock_counts for select using (auth.uid() is not null);
create policy "stock_reasons_select" on stock_reasons for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Expected values = the counts from the most recent APPROVED tally.
-- ---------------------------------------------------------------------------
create function get_stock_expected()
returns table (category_id uuid, expected integer)
language sql stable security definer set search_path = public as $$
  select c.category_id, c.counted
  from stock_counts c
  join stock_tallies t on t.id = c.tally_id
  where t.status = 'approved'
    and t.date = (select max(date) from stock_tallies where status = 'approved');
$$;

-- ---------------------------------------------------------------------------
-- Submit today's tally in one shot.
-- p_items: [{ "category_id": "...", "counted": 10,
--             "reasons": [{ "reason": "sold", "quantity": 1, "note": "..." }] }]
-- Validates that reasons fully explain each discrepancy, then randomly picks
-- a different employee as the verifier.
-- ---------------------------------------------------------------------------
create function submit_stock_tally(p_items jsonb)
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
  v_approver uuid;
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

  -- random verifier: any other employee; with nobody else, auto-approve.
  select id into v_approver from employees
  where role = 'employee' and id <> auth.uid()
  order by random() limit 1;

  insert into stock_tallies (date, submitted_by, approver_id, status, approved_at)
  values (
    v_today, auth.uid(), v_approver,
    case when v_approver is null then 'approved' else 'pending_approval' end,
    case when v_approver is null then now() else null end
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

-- ---------------------------------------------------------------------------
-- Verifier (or admin) approves or rejects.
-- ---------------------------------------------------------------------------
create function decide_stock_tally(p_tally_id uuid, p_approve boolean, p_note text default null)
returns stock_tallies
language plpgsql security definer set search_path = public as $$
declare
  v_tally stock_tallies;
begin
  select * into v_tally from stock_tallies where id = p_tally_id;
  if v_tally.id is null then
    raise exception 'Tally not found.';
  end if;
  if v_tally.status <> 'pending_approval' then
    raise exception 'This tally has already been decided.';
  end if;
  if auth.uid() <> v_tally.approver_id and not is_admin() then
    raise exception 'Only the assigned verifier (or admin) can decide this tally.';
  end if;
  if not p_approve and (p_note is null or trim(p_note) = '') then
    raise exception 'A note is required when rejecting — say what looks wrong.';
  end if;

  update stock_tallies
  set status = case when p_approve then 'approved' else 'rejected' end,
      approver_note = p_note,
      approved_at = case when p_approve then now() else null end
  where id = p_tally_id
  returning * into v_tally;

  return v_tally;
end;
$$;
