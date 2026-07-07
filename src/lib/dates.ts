import { format, startOfWeek } from 'date-fns'

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function isoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function currentWeekStartISO(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return format(new Date(iso), 'h:mm a')
}

export function formatDate(iso: string): string {
  return format(new Date(iso + 'T00:00:00'), 'd MMM yyyy')
}

export function formatDay(iso: string): string {
  return format(new Date(iso + 'T00:00:00'), 'EEEE')
}

export function hoursWorked(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return '—'
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime()
  const hrs = ms / (1000 * 60 * 60)
  return `${hrs.toFixed(1)}h`
}
