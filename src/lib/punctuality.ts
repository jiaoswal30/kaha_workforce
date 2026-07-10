import type { Attendance, StoreConfig } from '../types/database'

export type Punctuality = 'green' | 'yellow' | 'red'

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * Color band for a check-in: green = at/before opening, yellow = within the
 * late threshold (default 10 min), red = beyond it (auto half day).
 * Sundays use the Sunday opening time.
 */
export function classifyCheckIn(checkInISO: string, cfg: StoreConfig): Punctuality {
  const d = new Date(checkInISO)
  const open = parseTime(d.getDay() === 0 ? cfg.sunday_open_time : cfg.weekday_open_time)
  const t = minutesOfDay(d)
  if (t <= open) return 'green'
  if (t <= open + cfg.late_threshold_minutes) return 'yellow'
  return 'red'
}

/** Whether a checkout happened before the cutoff (default 7:30 PM) → half day. */
export function leftEarly(checkOutISO: string, cfg: StoreConfig): boolean {
  return minutesOfDay(new Date(checkOutISO)) < parseTime(cfg.checkout_cutoff)
}

export function punctualityOf(a: Attendance, cfg: StoreConfig | null): Punctuality | null {
  if (!cfg || !a.check_in_time) return null
  return classifyCheckIn(a.check_in_time, cfg)
}

export const PUNCTUALITY_LABELS: Record<Punctuality, string> = {
  green: 'On time',
  yellow: 'Late',
  red: 'Very late',
}
