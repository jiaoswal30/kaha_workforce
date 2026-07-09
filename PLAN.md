# Kaha Staff Manager — V2 Plan (Kiosk Attendance + Luxury Redesign)

## Core change

GPS attendance is removed. Attendance can ONLY be recorded on the **registered office computer** ("the kiosk"). Everything else (leave, tasks, logs, announcements, complaints) works from any device via personal login.

### Anti-fraud model

1. **Device lock** — the kiosk page only functions on a computer the admin has registered. Registration stores a secret `device_token` in that browser's localStorage and in the database. Any other computer opening `/kiosk` sees "This device is not registered."
2. **Personal PIN** — each employee has a 4-digit PIN (set by admin). Checking in = tap your name + enter PIN. Fast (~3 seconds), no shared-machine login/logout mess. 3 wrong attempts = 60-second lockout.
3. **Webcam selfie — OPTIONAL, admin-controlled.** A toggle in Admin → Team settings: "Require photo at check-in". When ON: the kiosk auto-captures a webcam photo at every check-in/out, stored on the attendance record, visible to admin (this defeats buddy-punching). When OFF (e.g. the kiosk laptop has no camera): the camera step is skipped entirely and check-in is PIN-only. Admin can flip this anytime; it takes effect on the kiosk immediately.

---

## Design language — "quiet luxury"

The reference is a jewelry maison, not a tech dashboard: calm, precise, spare.

- **Palette** (deliberately restrained — 90% of every screen is neutral):
  - Background: warm ivory `#FAF8F4` (paper, not white — feels like cardstock)
  - Surface/cards: `#FFFFFF` with hairline border `#E8E2D8`
  - Ink (text): near-black warm charcoal `#211D19`; secondary text `#8A8178`
  - Accent: **champagne gold `#A8895B`** — used ONLY for: active nav state, key serif numbers, thin section rules, focus rings. Never large fills. Gold everywhere = cheap; gold rarely = luxury.
  - Semantic (all muted, low-saturation): success sage `#5E7A5E` · warning bronze `#A6742C` · danger brick `#A34D3F` · info slate `#5C6B7A`. No neon, no candy colors, nothing childish.
  - Dark mode: espresso `#181410` base, surfaces `#221D18`, same gold, text `#EDE7DE`.
- **Typography**: Fraunces (serif, self-hosted) for headings, names, and big numbers; Inter for body/UI. Small-caps letterspaced labels for section headers ("THIS MONTH", "ATTENDANCE").
- **Structure & accuracy**: strict 4px spacing grid; one max-width (28rem) column on mobile; every card identical padding (20px); consistent 14px radius; baseline-aligned rows; no orphaned gaps, no double borders, no mixed icon sizes. Icons: lucide-react SVG at exactly 18px, 1.5px stroke — never emoji.
- **Loading**:
  - Boot: ivory screen, serif "K" monogram, single slow gold shimmer sweep.
  - Content: skeleton blocks shaped exactly like the final layout (soft 1.2s pulse). No spinners inside content.
  - Buttons: working state swaps label for a small rotating ◇ glyph.
  - Transitions: 150ms fade + 4px rise on route change. Kiosk success: checkmark draw-in.
- **Voice**: contextual ("Good morning, Priya ✦"), concise, never exclamation-heavy.

---

## Database migration `0002_kiosk.sql`

- `registered_devices` (id, device_token uuid unique, name, registered_by, is_active, created_at). Admin-only RLS.
- `employees.pin_hash text` (bcrypt via pgcrypto).
- `store_config.require_photo boolean default true` — the camera toggle.
- `attendance.check_in_photo text`, `attendance.check_out_photo text` (base64 JPEG ~40KB, nullable — null when photo off).
- `pin_attempts` table for lockout tracking.
- `complaints` (id, employee_id, category text check in ('workplace','schedule','customer_incident','equipment','other'), subject text, body text, status text check in ('open','in_discussion','resolved') default 'open', created_at) + `complaint_messages` (id, complaint_id, sender_id, body, created_at) — a private thread per complaint. RLS: the raising employee + admin only. Other employees can never see it.
- **Drop** GPS `check_in`/`check_out` functions.
- Kiosk functions (security definer, anon-callable — device token is the credential):
  - `register_device(p_name)` / `revoke_device(p_id)` — admin session required.
  - `set_employee_pin(p_employee_id, p_pin)` — admin session required.
  - `kiosk_roster(p_device_token)` — employee names + in/out status + whether photo is required (so the kiosk knows to skip camera).
  - `kiosk_check_in(p_device_token, p_employee_id, p_pin, p_photo default null)` — validates device + PIN + lockout; enforces photo only if `require_photo` is on; same late/half-day logic (11:00 / Sun 12:00 + 15 min).
  - `kiosk_check_out(...)` — same shape.
- Leave math, carry-forward, conflict trigger, backfill, todo carry-over: unchanged.

---

## Every page, exactly

### 1. `/kiosk` — office computer, always open
**Unregistered device**: centered card — monogram, "This device is not registered for attendance", hint "Admin: register this computer from Team settings."

**Roster screen**: serif date ("Thursday, 9 July") + live clock; 2-column grid of employee cards (serif name, status line: "Not in yet" / gold "In since 11:02 AM" / "Done · 11:02 AM – 7:14 PM"); tap card → PIN. Footer "Kaha ✦ Staff Attendance". Auto-refresh every 60s.

**PIN screen**: "Hi, Priya" serif; 4 dots; on-screen 3×4 keypad (large targets, no OS keyboard). Wrong: shake + "2 attempts left"; 3rd: "Locked for 60 seconds". Cancel returns.

**Camera step — only if admin toggle ON**: circular live preview, 3-2-1 countdown, auto-capture, no retake. Camera missing/denied while required: "Camera required — ask admin", cancelled. Toggle OFF: this step doesn't exist; PIN success goes straight to confirmation.

**Confirmation** (4s, auto-return): checkmark draw-in, "Checked in ✦ 11:02 AM" / "Checked out — see you tomorrow". Late: bronze note "Marked as half day (after 11:15)".

### 2. `/login` — personal accounts, any device
Centered: monogram, "Kaha" serif, "STAFF" small caps. Email + password (hairline inputs, gold focus), full-width charcoal button. Error banner. Role-routed redirect.

### 3. Employee `/` — Home
Header on all logged-in pages: "Kaha" wordmark; name + sign out. Bottom nav: Home · Leave · Tasks · Log · More (More = sheet with Notes, Notices, Concerns).
- Greeting: "Good morning, Priya ✦" + date.
- **Today card** (read-only): "Checked in at 11:02 AM" / "Not checked in — use the store computer" / "Shift complete · 8.2h"; bronze half-day tag when applicable.
- **Leave card**: serif number of paid leaves left, "PAID LEAVE THIS MONTH", next week-off date.
- **Unread announcements banner** when unread > 0 → Notices.
- **To-dos card**: quick-add + gold checkboxes, strikethrough done, "carried over" hairline tag.

### 4. Employee `/leave`
Balance card (serif number, bronze deficit note when carried); month calendar (green worked / slate-blue week off / gold paid leave / bronze half day / brick absent-unpaid, gold ring on today, ‹ › month switcher, legend); week-off day card (dropdown + confirm); request form (date min tomorrow, type, submit — success sage banner, conflict bronze banner "Two employees are already off that date — sent to admin for override"); last 10 requests with status chips + admin notes.

### 5. Employee `/tasks`
To-dos: add (title + optional description), tap-to-cycle status pill (Pending → In progress → Done), timestamps, carried tag, admin comments in gold italic. Weekly goals: "WEEK OF 7 JULY", SVG gold progress ring (3/5), add (max 5, disabled state with note), checkboxes.

### 6. Employee `/log`
Four fields: customers (numeric stepper), key activities (textarea), sales notes (optional), issues (optional, bronze-tinted). Upsert; pre-filled if already logged ("Logged at 7:20 PM — you can update it"). Below: last 7 logs, collapsed, tap-to-expand.

### 7. Employee `/concerns` — NEW (Complaints)
- Intro line: "Raise anything — only you and the admin can see it."
- **New concern form**: category select (Workplace · Schedule · Customer incident · Equipment · Other), subject (one line), details (textarea). Submit → "Sent to admin."
- **My concerns list**: cards with subject, category chip, status chip (Open grey / In discussion bronze / Resolved sage), last-message preview, tap → **thread view**: full conversation bubbles (employee right-aligned ivory, admin left-aligned white), reply box at bottom. Employee can reply anytime until resolved; resolved threads are read-only with a "Reopen" text button.

### 8. `/notes` — Inventory notes (shared)
Post box; feed cards (text, author, relative time); resolved = faded + sage chip; admin gets resolve/reopen.

### 9. `/announcements` (shared)
Admin compose card on top. Feed: unread = gold left rule + "NEW" chip; opening marks read. Small-caps dates.

### 10. Admin `/` — Home ("Today")
- **Live attendance**: per-employee row — name, status chip, in/out times, selfie thumbnail when photos are on (tap = modal enlarge), bronze LATE tag.
- **Pending leave requests**: inline Approve/Reject; conflict-auto-rejected ones show "Approve anyway" (override).
- **Open concerns card**: count + latest subject lines → `/admin/concerns`. (Complaints surface here so nothing rots unseen.)
- **Task pulse**: per-employee "3/5 done" + thin progress bar.
- **Latest logs**: 5 one-liners → Logs.
- **Unresolved notes**: up to 3 + count → Notes.
- **Quick links** 2×2: Attendance · Leave · Team · Announcements.

### 11. Admin `/admin/attendance`
Range picker (This month · Last month · Custom); per-employee summary table (present / half days / absent / paid used / balance left); entries list (employee, date+weekday, in/out, hours, LATE/HALF-DAY tags, selfie thumbnails when present, status chip); CSV export (photos excluded).

### 12. Admin `/admin/leave`
Balances per employee (available serif number, used, carried deficit, weekly-off dropdown, "Adjust" inline panel: ±1 used + mandatory reason); all requests with filter + override controls; carry-forward log lines ("June: 5th week off consumed paid leave (auto)").

### 13. Admin `/admin/team` — NEW
- **Employee list**: name, email, weekly off, PIN status ("PIN set" / bronze "No PIN — kiosk blocked"), "Set PIN" modal (enter 4 digits twice; only admin can set/change PINs).
- **Kiosk settings card**:
  - Toggle: **"Require photo at check-in"** — helper text: "Turn off if the kiosk computer has no camera. Attendance becomes PIN-only." Takes effect immediately.
  - Registered devices list (name, date, active) + "Register THIS computer" + per-device "Revoke".
- Hint: employee accounts are created in the Supabase dashboard (small link + one-line how-to).

### 14. Admin `/admin/concerns` — NEW
List of all concerns: employee name, subject, category chip, status chip, age ("2d"). Filter: Open / In discussion / Resolved / All. Tap → thread view (same bubbles) + admin reply box + status control (Open → In discussion → Resolved with optional closing note). Changing status posts a system line in the thread ("Marked resolved by admin · 9 Jul").

### 15. Admin `/admin/tasks` + `/admin/logs`
As currently built, restyled: assign-task form, per-employee lists with inline comments, goals summary; logs feed with employee/date filters.

---

## Extras — decided

- **Monthly performance snapshot (IN)** — `/admin/performance`: month picker, one card per employee — attendance % (present+half/working days), punctuality (on-time %), half days, tasks completed, weekly-goal rate. Computed from existing data, no new tables.
- Attendance correction requests, kudos: skipped by owner decision.

## Build order

1. `0002_kiosk.sql` (device registry, PINs, photo toggle, complaints, kiosk RPCs, drop GPS) — you run it once in the SQL editor.
2. Design system: fonts, palette, primitives (Card, Button, chips, skeletons, monogram loader, ring), restyle all existing pages.
3. Kiosk flow (roster → PIN → optional camera → confirmation).
4. Admin Team (PINs, photo toggle, device registration).
5. Concerns (employee + admin, threads).
6. Employee Home rework + chosen extras + transitions/loading polish.
7. Build check + push to GitHub.
