-- Adds an employee-supplied reason to leave requests (required in the UI for
-- unpaid leave; paid leave needs no reason). Run after 0002_kiosk.sql.

alter table leave_requests add column reason text;
