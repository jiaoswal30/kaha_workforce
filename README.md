# Kaha Staff Manager

A mobile-first staff management app for Kaha (lab-grown diamond jewelry, Bengaluru): GPS-verified attendance, leave management with 5-week carry-forward, daily to-dos & weekly goals, daily work logs, inventory notes, and announcements.

Stack: React + Vite + TypeScript, Tailwind CSS v4, Supabase (Postgres + Auth), deployed on Vercel.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL Editor and run the contents of `supabase/migrations/0001_init.sql` once. This creates all tables, RLS policies, and the business-logic functions (check-in/out, leave carry-forward, conflict detection, etc.).
3. In that same file's last section, edit the seeded `store_config` row's `latitude`/`longitude` to the real store location (or update it later from the SQL editor: `update store_config set latitude = ..., longitude = ...;`).

## 2. Create the admin + employee accounts

There's no in-app sign-up — for a 3-4 person store, accounts are created once via the Supabase dashboard:

1. Go to **Authentication → Users → Add User** (email + password, auto-confirm).
2. In the **User Metadata** JSON field, set:
   ```json
   { "name": "Priya Sharma", "role": "admin" }
   ```
   or for an employee with their weekly off day:
   ```json
   { "name": "Arjun Rao", "role": "employee", "weekly_off_day": "monday" }
   ```
3. A database trigger (`handle_new_user`) automatically creates the matching row in the `employees` table. If `weekly_off_day` is omitted, the employee (or admin, from the Leave screen) can set it later from the app.

Repeat for all 3-4 staff members plus one admin.

## 3. Configure the app

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings → API** in Supabase.

```bash
npm install
npm run dev
```

## 4. Deploy to Vercel

1. Push this project to a Git repo and import it in Vercel (framework preset: Vite).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Vercel project settings.
3. Deploy. `vercel.json` is already set up to rewrite all routes to `index.html` for client-side routing.

## Notes on business logic

- **Late / half-day**: computed server-side in the `check_in` Postgres function against `store_config.weekday_open_time` / `sunday_open_time` + `late_threshold_minutes`.
- **5-week-month carry-forward**: handled by `sync_leave_balance`, called lazily whenever a balance is read or an attendance/leave event touches a month — no cron job required. It's idempotent (uses `fifth_week_off_consumed` / `deficit_carried_to_next_month` flags internally), so it can safely re-run.
- **Leave conflicts**: submitting a leave request when 2 employees are already off that date doesn't block the insert — it auto-rejects with a note so the admin can still see it and approve it anyway (the override the spec asks for). See the `check_leave_conflict` trigger.
- **Absence backfill**: past dates with no check-in and no approved leave are lazily filled in as `week_off` / `absent` / `unpaid_leave` when a calendar view is opened (`ensure_attendance_status_range` for admin, `ensure_my_attendance_status_range` for the employee's own calendar) — also no cron needed.
- **Task carry-over**: incomplete to-dos roll to the current day when the employee's Home/Tasks screen loads (`carry_over_my_todos`), tagged "carried over".

If you'd rather run these on a schedule instead of lazily, enable the `pg_cron` extension in Supabase and schedule `ensure_attendance_status_range` and `carry_over_my_todos` nightly — the functions are already idempotent.

## Project structure

```
supabase/migrations/0001_init.sql   # full schema, RLS, functions — the entire backend
src/lib/                            # supabase client, geolocation, date helpers
src/contexts/AuthContext.tsx        # session + employee profile
src/layouts/AppShell.tsx            # mobile shell with bottom nav (role-aware)
src/pages/employee/                 # employee-facing screens
src/pages/admin/                    # admin-facing screens
src/pages/shared/                   # notes & announcements (shared by both roles)
```
