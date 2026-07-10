import type { Followup, FollowupPriority, FollowupType } from '../types/database'
import { todayISO } from './dates'

export const FOLLOWUP_TYPE_LABELS: Record<FollowupType, string> = {
  order: 'Order',
  conversion: 'Conversion',
  query: 'Query',
}

export const PRIORITY_ORDER: Record<FollowupPriority, number> = { high: 0, medium: 1, low: 2 }

export function isOverdue(f: Followup): boolean {
  return f.status === 'pending' && f.due_date < todayISO()
}

export function isDueToday(f: Followup): boolean {
  return f.status === 'pending' && f.due_date === todayISO()
}

/** Overdue first (oldest due first), then by due date, then priority. */
export function sortByUrgency(items: Followup[]): Followup[] {
  return [...items].sort((a, b) => {
    const aOver = isOverdue(a) ? 0 : 1
    const bOver = isOverdue(b) ? 0 : 1
    if (aOver !== bOver) return aOver - bOver
    if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date)
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  })
}

/* ---- browser reminders (in-app; fires while the app is open) ---- */

export function remindersSupported(): boolean {
  return 'Notification' in window
}

export async function enableReminders(): Promise<boolean> {
  if (!remindersSupported()) return false
  const p = await Notification.requestPermission()
  return p === 'granted'
}

/** One notification per day summarizing due/overdue follow-ups. */
export function notifyDueFollowups(items: Followup[]) {
  if (!remindersSupported() || Notification.permission !== 'granted') return
  const due = items.filter((f) => isOverdue(f) || isDueToday(f))
  if (due.length === 0) return
  const key = `kaha_followup_notified_${todayISO()}`
  if (localStorage.getItem(key)) return
  localStorage.setItem(key, '1')
  const overdue = due.filter(isOverdue).length
  new Notification('Kaha ✦ Follow-ups', {
    body:
      overdue > 0
        ? `${due.length} follow-up(s) need attention — ${overdue} overdue.`
        : `${due.length} follow-up(s) due today.`,
    tag: 'kaha-followups',
  })
}
