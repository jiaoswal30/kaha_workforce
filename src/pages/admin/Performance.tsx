import { useCallback, useEffect, useState } from 'react'
import { addMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { Card, SectionLabel, PageSkeleton, EmptyState } from '../../components/ui'
import type { Attendance, Employee, Todo, WeeklyGoal } from '../../types/database'

export default function AdminPerformance() {
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [employees, setEmployees] = useState<Employee[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [goals, setGoals] = useState<WeeklyGoal[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const start = format(month, 'yyyy-MM-dd')
    const end = format(endOfMonth(month), 'yyyy-MM-dd')
    const [{ data: emps }, { data: att }, { data: t }, { data: g }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('attendance').select('*').gte('date', start).lte('date', end),
      supabase.from('todos').select('*').gte('date', start).lte('date', end),
      supabase.from('weekly_goals').select('*').gte('week_start', start).lte('week_start', end),
    ])
    setEmployees(emps ?? [])
    setAttendance(att ?? [])
    setTodos(t ?? [])
    setGoals(g ?? [])
    setLoading(false)
  }, [month])

  useEffect(() => {
    load()
  }, [load])

  const isCurrentMonth = format(month, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Performance</h1>

      <div className="flex items-center justify-between rounded-[14px] border border-hairline bg-white px-4 py-2.5 dark:border-hairline-dark dark:bg-espresso-2">
        <button onClick={() => setMonth(subMonths(month, 1))} className="p-1 text-ink-soft hover:text-ink dark:hover:text-ivory-dark-text">
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <p className="font-display text-lg text-ink dark:text-ivory-dark-text">{format(month, 'MMMM yyyy')}</p>
        <button
          onClick={() => setMonth(addMonths(month, 1))}
          disabled={isCurrentMonth}
          className="p-1 text-ink-soft hover:text-ink disabled:opacity-30 dark:hover:text-ivory-dark-text"
        >
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      </div>

      {loading ? (
        <PageSkeleton />
      ) : employees.length === 0 ? (
        <Card><EmptyState>No employees yet.</EmptyState></Card>
      ) : (
        employees.map((emp) => {
          const rows = attendance.filter((a) => a.employee_id === emp.id)
          const present = rows.filter((r) => r.status === 'present').length
          const half = rows.filter((r) => r.status === 'half_day').length
          const absent = rows.filter((r) => r.status === 'absent' || r.status === 'unpaid_leave').length
          const paidLeave = rows.filter((r) => r.status === 'paid_leave').length
          const weekOffs = rows.filter((r) => r.status === 'week_off').length
          const workingBase = present + half + absent
          const attendancePct = workingBase > 0 ? Math.round(((present + half * 0.5) / workingBase) * 100) : null

          const checkIns = rows.filter((r) => r.check_in_time !== null)
          const onTime = checkIns.filter((r) => !r.is_late).length
          const punctualityPct = checkIns.length > 0 ? Math.round((onTime / checkIns.length) * 100) : null

          const empTodos = todos.filter((t) => t.employee_id === emp.id)
          const tasksDone = empTodos.filter((t) => t.status === 'done').length
          const empGoals = goals.filter((g) => g.employee_id === emp.id)
          const goalsDone = empGoals.filter((g) => g.is_completed).length

          return (
            <Card key={emp.id}>
              <SectionLabel>{emp.name}</SectionLabel>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Metric label="Attendance" value={attendancePct !== null ? `${attendancePct}%` : '—'} />
                <Metric label="Punctuality" value={punctualityPct !== null ? `${punctualityPct}%` : '—'} />
                <Metric label="Tasks done" value={empTodos.length > 0 ? `${tasksDone}/${empTodos.length}` : '—'} />
                <Metric label="Goals met" value={empGoals.length > 0 ? `${goalsDone}/${empGoals.length}` : '—'} />
              </div>
              <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-soft dark:border-hairline-dark">
                {present} full · {half} half · {absent} absent · {paidLeave} paid leave · {weekOffs} week offs
              </p>
            </Card>
          )
        })
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-3xl text-ink dark:text-ivory-dark-text">{value}</p>
      <p className="label-caps mt-1">{label}</p>
    </div>
  )
}
