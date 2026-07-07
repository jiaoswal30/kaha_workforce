import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay } from 'date-fns'
import type { Attendance, WeekdayName } from '../types/database'

const STATUS_COLORS: Record<string, string> = {
  present: 'bg-green-500',
  half_day: 'bg-orange-500',
  absent: 'bg-red-500',
  week_off: 'bg-blue-500',
  paid_leave: 'bg-yellow-500',
  unpaid_leave: 'bg-red-500',
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
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-stone-400">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map((d) => {
          const dateStr = format(d, 'yyyy-MM-dd')
          const rec = byDate.get(dateStr)
          const isFuture = dateStr > todayStr
          const isUpcomingOff = isFuture && weeklyOffDay && WEEKDAY_INDEX[getDay(d)] === weeklyOffDay
          const color = rec?.status ? STATUS_COLORS[rec.status] : isUpcomingOff ? 'bg-blue-200' : undefined
          return (
            <div
              key={dateStr}
              className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium ${
                color ? `${color} text-white` : 'bg-stone-100 text-stone-500 dark:bg-stone-800'
              } ${dateStr === todayStr ? 'ring-2 ring-accent-600 ring-offset-1' : ''}`}
              title={rec?.status ?? (isUpcomingOff ? 'upcoming week off' : '')}
            >
              {d.getDate()}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
        <Legend color="bg-green-500" label="Worked" />
        <Legend color="bg-blue-500" label="Week off" />
        <Legend color="bg-yellow-500" label="Paid leave" />
        <Legend color="bg-orange-500" label="Half day" />
        <Legend color="bg-red-500" label="Absent/unpaid" />
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}
    </span>
  )
}
