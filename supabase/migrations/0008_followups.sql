-- Customer follow-ups: orders, conversions (interested customers), and
-- queries (e.g. an Instagram DM) that must not be forgotten. Assigned to an
-- employee with priority + due date; employee marks done, admin sees it.

create table followups (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  created_by uuid references employees(id),
  type text not null check (type in ('order', 'conversion', 'query')),
  customer_name text not null,
  contact text,
  details text,
  priority text not null check (priority in ('low', 'medium', 'high')) default 'medium',
  due_date date not null,
  status text not null check (status in ('pending', 'done')) default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_followups_employee_status on followups (employee_id, status, due_date);

alter table followups enable row level security;

create policy "followups_select" on followups for select
  using (employee_id = auth.uid() or is_admin());
create policy "followups_insert" on followups for insert
  with check (
    (employee_id = auth.uid() and created_by = auth.uid()) or is_admin()
  );
create policy "followups_update" on followups for update
  using (employee_id = auth.uid() or is_admin());
create policy "followups_delete_admin" on followups for delete
  using (is_admin());
