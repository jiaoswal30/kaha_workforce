# Kaha Staff Manager

Staff management for Kaha (lab-grown diamond jewelry, Bengaluru): kiosk attendance on a registered office computer (PIN + optional webcam photo), leave management with 5-week carry-forward, daily to-dos & weekly goals, daily work logs, private employee concerns, inventory notes, announcements, and monthly performance snapshots.

Stack: React + Vite + TypeScript, Tailwind CSS v4, Supabase (Postgres + Auth), deployed on Vercel. Full page-by-page spec in `PLAN.md`.

## How attendance works (no GPS)

Attendance can only be recorded on a computer the admin has **registered** (the "kiosk", at `/kiosk`):

1. **Device lock** — `/kiosk` only functions on registered computers (admin registers from Team settings; a secret token is stored in that browser).
2. **Personal PIN** — employee taps their name, enters their 4-digit PIN (set by admin). 3 wrong attempts = 60-second lockout.
3. **Webcam photo (optional)** — when "Require photo at check-in" is ON in Team settings, the kiosk captures a selfie at every check-in/out, shown to the admin in attendance views. Turn it OFF if the kiosk machine has no camera (attendance becomes PIN-only).

Late/half-day logic: opening 11:00 (Sundays 12:00) + 15-minute grace; later check-in = automatic half day. Two half days a month = 1 paid leave deducted... (handled by the same leave engine as before).

Everything else — leave requests, balances, tasks, logs, concerns, notices — works from any device via personal email/password login.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor run, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_kiosk.sql`

### 2. Accounts

No in-app sign-up — create accounts in the dashboard (**Authentication → Users → Add User**, auto-confirm), with **User Metadata**:

```json
{ "name": "Priya Sharma", "role": "admin" }
```
```json
{ "name": "Arjun Rao", "role": "employee", "weekly_off_day": "monday" }
```

A trigger creates the matching `employees` row automatically.

### 3. App configuration

```bash
cp .env.example .env   # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (Project Settings → API)
npm install
npm run dev
```

### 4. First-run checklist (in the app, as admin)

1. Open **Team** → set a 4-digit PIN for every employee (kiosk is blocked without one).
2. On the office computer: **Team → Register this computer**, give it a name.
3. Decide the **"Require photo at check-in"** toggle (needs a webcam on the kiosk machine).
4. Open **`/kiosk`** on that computer and leave it open — that's the attendance screen.

### 5. Deploy to Vercel

Import the repo (framework preset: Vite), add the two `VITE_*` env vars, deploy. `vercel.json` handles client-side routing. On the office computer, browse to `https://your-app.vercel.app/kiosk` after registering the device.

## Notes on business logic

- **Kiosk RPCs** (`kiosk_roster`, `kiosk_check_in`, `kiosk_check_out`) run without a login session — the registered device token is the credential, validated server-side. Admin/management functions explicitly revoke anon access.
- **5-week-month carry-forward**: `sync_leave_balance` runs lazily whenever balances are read — idempotent, no cron.
- **Leave conflicts**: a request when 2 employees are already off that date is auto-rejected with a note; the admin can still "Approve anyway" (override).
- **Absence backfill** and **task carry-over** also run lazily on page loads.
- **Concerns** are private: RLS restricts each thread to the raising employee + admin.
- **Photos** are stored as small base64 JPEGs on the attendance row (~40 KB each) — fine at this team size; excluded from CSV export.

## Project structure

```
supabase/migrations/        # 0001 core schema · 0002 kiosk/PIN/photos/concerns
src/pages/Kiosk.tsx         # attendance kiosk (device-locked, no login)
src/pages/employee/         # home, leave, tasks, log, concerns
src/pages/admin/            # today, attendance, leave, team, tasks, logs, concerns, performance
src/pages/shared/           # inventory notes, announcements
src/components/             # design-system primitives, calendar, threads, photo viewer
PLAN.md                     # full page-by-page specification
```
