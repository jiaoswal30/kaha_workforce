import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay } from 'date-fns'
import type { Attendance, WeekdayName } from '../types/database'

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-sage-500 text-white',
  half_day: 'bg-bronze-500 text-white',
  absent: 'bg-brick-500 text-white',
  week_off: 'bg-slate-500 text-white',
  paid_leave: 'bg-gold-500 text-white',
  unpaid_leave: 'bg-brick-500 text-white',
}

const WEEKDAY_INDEX: WeekdayName[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export default function MonthCalendar({
  month,
  year,
  attendance,
  weeklyOffDay,
}: {
  month: number
  year: number
  attendance: Attendance[]
  weeklyOffDay: WeekdayName | null
}) {
  const monthStart = startOfMonth(new Date(year, month - 1, 1))
  const monthEnd = endOfMonth(monthStart)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const leadingBlanks = getDay(monthStart)
  const byDate = new Map(attendance.map((a) => [a.date, a]))
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 text-center text-[10px] font-medium tracking-wider text-ink-soft">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map((d) => {
          const dateStr = format(d, 'yyyy-MM-dd')
          const rec = byDate.get(dateStr)
          const isFuture = dateStr > todayStr
          const isUpcomingOff = isFuture && weeklyOffDay && WEEKDAY_INDEX[getDay(d)] === weeklyOffDay
          const statusCls = rec?.status ? STATUS_COLORS[rec.status] : null
          return (
            <div
              key={dateStr}
              className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium ${
                statusCls ??
                (isUpcomingOff
                  ? 'border border-slate-500/50 text-slate-500'
                  : 'bg-ivory text-ink-soft dark:bg-espresso')
              } ${dateStr === todayStr ? 'ring-1 ring-gold-500 ring-offset-2 ring-offset-white dark:ring-offset-espresso-2' : ''}`}
              title={rec?.status?.replace('_', ' ') ?? (isUpcomingOff ? 'upcoming week off' : '')}
            >
              {d.getDate()}
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-ink-soft">
        <Legend cls="bg-sage-500" label="Worked" />
        <Legend cls="bg-slate-500" label="Week off" />
        <Legend cls="bg-gold-500" label="Paid leave" />
        <Legend cls="bg-bronze-500" label="Half day" />
        <Legend cls="bg-brick-500" label="Absent" />
      </div>
    </div>
  )
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${cls}`} /> {label}
    </span>
  )
}
