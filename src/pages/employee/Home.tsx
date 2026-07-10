import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, getDay, addDays } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { todayISO, formatTime, hoursWorked } from '../../lib/dates'
import { Card, SectionLabel, Button, Banner, Chip, Input, PageSkeleton } from '../../components/ui'
import { isDueToday, isOverdue, notifyDueFollowups, sortByUrgency, FOLLOWUP_TYPE_LABELS } from '../../lib/followups'
import type { Attendance, Followup, LeaveBalance, StockTally, Todo, WeekdayName } from '../../types/database'

const WEEKDAY_INDEX: WeekdayName[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function nextWeekOff(day: WeekdayName | null): string | null {
  if (!day) return null
  const target = WEEKDAY_INDEX.indexOf(day)
  for (let i = 0; i < 8; i++) {
    const d = addDays(new Date(), i)
    if (getDay(d) === target && i > 0) return format(d, 'EEE, d MMM')
    if (getDay(d) === target && i === 0) return 'today'
  }
  return null
}

export default function EmployeeHome() {
  const { employee } = useAuth()
  const [attendance, setAttendance] = useState<Attendance | null>(null)
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [dueFollowups, setDueFollowups] = useState<Followup[]>([])
  const [todayStockTally, setTodayStockTally] = useState<StockTally | null>(null)
  const [newTask, setNewTask] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!employee) return
    await supabase.rpc('carry_over_my_todos')
    const [{ data: att }, { data: bal }, { data: t }, { data: allAnn }, { data: reads }, { data: fups }, { data: stock }] =
      await Promise.all([
        supabase.from('attendance').select('*').eq('employee_id', employee.id).eq('date', todayISO()).maybeSingle(),
        supabase.rpc('get_my_leave_balance', {
          p_month: new Date().getMonth() + 1,
          p_year: new Date().getFullYear(),
        }),
        supabase.from('todos').select('*').eq('employee_id', employee.id).eq('date', todayISO()).order('created_at'),
        supabase.from('announcements').select('id'),
        supabase.from('announcement_reads').select('announcement_id').eq('employee_id', employee.id),
        supabase.from('followups').select('*').eq('employee_id', employee.id).eq('status', 'pending'),
        supabase.from('stock_tallies').select('*').eq('date', todayISO()).maybeSingle(),
      ])
    setAttendance(att ?? null)
    setBalance((bal as LeaveBalance) ?? null)
    setTodos(t ?? [])
    const readIds = new Set((reads ?? []).map((r: { announcement_id: string }) => r.announcement_id))
    setUnreadCount((allAnn ?? []).filter((a: { id: string }) => !readIds.has(a.id)).length)
    const due = sortByUrgency((fups ?? []).filter((f: Followup) => isOverdue(f) || isDueToday(f)))
    setDueFollowups(due)
    notifyDueFollowups(fups ?? [])
    setTodayStockTally(stock ?? null)
    setLoading(false)
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  async function quickAddTask(e: FormEvent) {
    e.preventDefault()
    if (!employee || !newTask.trim()) return
    await supabase.from('todos').insert({ employee_id: employee.id, date: todayISO(), title: newTask.trim() })
    setNewTask('')
    await load()
  }

  async function toggleTodo(todo: Todo) {
    const done = todo.status !== 'done'
    await supabase
      .from('todos')
      .update({ status: done ? 'done' : 'pending', completed_at: done ? new Date().toISOString() : null })
      .eq('id', todo.id)
    await load()
  }

  const available = balance ? balance.paid_leaves_entitled - balance.carried_deduction - balance.paid_leaves_used : null
  const upcomingOff = nextWeekOff(employee?.weekly_off_day ?? null)

  if (loading) return <PageSkeleton />

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">
          {greeting()}, {employee?.name?.split(' ')[0]} <span className="text-gold-500">✦</span>
        </h1>
        <p className="mt-0.5 text-sm text-ink-soft">{format(new Date(), 'EEEE, d MMMM')}</p>
      </div>

      {unreadCount > 0 && (
        <Link to="/announcements" className="block lg:col-span-2">
          <Banner tone="info">
            {unreadCount} unread notice{unreadCount > 1 ? 's' : ''} — tap to read
          </Banner>
        </Link>
      )}

      {todayStockTally?.status === 'pending_approval' && todayStockTally.approver_id === employee?.id && (
        <Link to="/stock" className="block lg:col-span-2">
          <Banner tone="warning">You've been picked to verify today's stock tally — tap to review</Banner>
        </Link>
      )}

      {dueFollowups.length > 0 && (
        <Link to="/followups" className="block lg:col-span-2">
          <Card className="!border-bronze-500/40">
            <SectionLabel>Follow-ups needing attention</SectionLabel>
            <ul className="space-y-1.5">
              {dueFollowups.slice(0, 3).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-ink dark:text-ivory-dark-text">
                    {f.customer_name} · {FOLLOWUP_TYPE_LABELS[f.type]}
                  </span>
                  <span className={`shrink-0 text-xs font-medium ${isOverdue(f) ? 'text-brick-500' : 'text-bronze-500'}`}>
                    {isOverdue(f) ? 'Overdue' : 'Due today'}
                  </span>
                </li>
              ))}
            </ul>
            {dueFollowups.length > 3 && <p className="mt-1.5 text-xs text-gold-600">+{dueFollowups.length - 3} more</p>}
          </Card>
        </Link>
      )}

      <Card>
        <SectionLabel>Today</SectionLabel>
        {attendance?.check_in_time && !attendance.check_out_time ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-2xl text-ink dark:text-ivory-dark-text">{formatTime(attendance.check_in_time)}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Checked in</p>
            </div>
            {attendance.is_half_day ? <Chip tone="bronze">Half day</Chip> : <Chip tone="sage">On shift</Chip>}
          </div>
        ) : attendance?.check_out_time ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-2xl text-ink dark:text-ivory-dark-text">
                {hoursWorked(attendance.check_in_time, attendance.check_out_time)}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {formatTime(attendance.check_in_time)} – {formatTime(attendance.check_out_time)}
              </p>
            </div>
            <Chip tone={attendance.is_half_day ? 'bronze' : 'sage'}>
              {attendance.is_half_day ? 'Half day' : 'Shift complete'}
            </Chip>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Not checked in — use the store computer to check in.</p>
        )}
      </Card>

      <Card>
        <SectionLabel>Paid leave this month</SectionLabel>
        <div className="flex items-end justify-between">
          <p className="font-display text-4xl text-gold-600">{Math.max(available ?? 0, 0)}</p>
          {upcomingOff && <p className="text-xs text-ink-soft">Next week off: {upcomingOff}</p>}
        </div>
        {balance && balance.carried_deduction > 0 && (
          <p className="mt-2 text-xs text-bronze-500">Last month's 5th week off carried a deduction into this month.</p>
        )}
      </Card>

      <Card className="lg:col-span-2">
        <SectionLabel>Today's to-do</SectionLabel>
        <form onSubmit={quickAddTask} className="mb-3 flex gap-2">
          <Input placeholder="Quick add a task" value={newTask} onChange={(e) => setNewTask(e.target.value)} className="!py-2" />
          <Button type="submit" className="!py-2 text-xs">Add</Button>
        </form>
        <ul className="space-y-2">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={t.status === 'done'}
                onChange={() => toggleTodo(t)}
                className="h-4 w-4 accent-gold-500"
              />
              <span className={`text-sm ${t.status === 'done' ? 'text-ink-soft line-through' : 'text-ink dark:text-ivory-dark-text'}`}>
                {t.title}
              </span>
              {t.carried_from && <Chip tone="neutral">carried</Chip>}
            </li>
          ))}
          {todos.length === 0 && <p className="text-sm text-ink-soft">Nothing planned yet — add your first task.</p>}
        </ul>
      </Card>
    </div>
  )
}
