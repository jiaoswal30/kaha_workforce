import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { getCurrentPosition } from '../../lib/geolocation'
import { todayISO, formatTime } from '../../lib/dates'
import { Card, Button, Banner, StatusBadge } from '../../components/ui'
import type { Attendance, LeaveBalance, Todo } from '../../types/database'

export default function EmployeeHome() {
  const { employee } = useAuth()
  const [attendance, setAttendance] = useState<Attendance | null>(null)
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTask, setNewTask] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!employee) return
    await supabase.rpc('carry_over_my_todos')
    const [{ data: att }, { data: bal }, { data: t }, { data: allAnn }, { data: reads }] = await Promise.all([
      supabase.from('attendance').select('*').eq('employee_id', employee.id).eq('date', todayISO()).maybeSingle(),
      supabase.rpc('get_my_leave_balance', {
        p_month: new Date().getMonth() + 1,
        p_year: new Date().getFullYear(),
      }),
      supabase.from('todos').select('*').eq('employee_id', employee.id).eq('date', todayISO()).order('created_at'),
      supabase.from('announcements').select('id'),
      supabase.from('announcement_reads').select('announcement_id').eq('employee_id', employee.id),
    ])
    setAttendance(att ?? null)
    setBalance((bal as LeaveBalance) ?? null)
    setTodos(t ?? [])
    const readIds = new Set((reads ?? []).map((r: { announcement_id: string }) => r.announcement_id))
    setUnreadCount((allAnn ?? []).filter((a: { id: string }) => !readIds.has(a.id)).length)
    setLoading(false)
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  async function handleCheckIn() {
    setError(null)
    setWorking(true)
    try {
      const { lat, lng } = await getCurrentPosition()
      const { error } = await supabase.rpc('check_in', { p_lat: lat, p_lng: lng })
      if (error) throw error
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setWorking(false)
    }
  }

  async function handleCheckOut() {
    setError(null)
    setWorking(true)
    try {
      const { lat, lng } = await getCurrentPosition()
      const { error } = await supabase.rpc('check_out', { p_lat: lat, p_lng: lng })
      if (error) throw error
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setWorking(false)
    }
  }

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

  const isCheckedIn = attendance?.check_in_time && !attendance?.check_out_time
  const available = balance ? balance.paid_leaves_entitled - balance.carried_deduction - balance.paid_leaves_used : null

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Hi, {employee?.name?.split(' ')[0]}</h1>

      {error && <Banner tone="error">{error}</Banner>}

      {unreadCount > 0 && (
        <Link to="/announcements">
          <Banner tone="info">
            📣 {unreadCount} unread announcement{unreadCount > 1 ? 's' : ''} — tap to view
          </Banner>
        </Link>
      )}

      <Card className="text-center">
        {isCheckedIn ? (
          <>
            <p className="text-sm text-stone-500">Checked in since</p>
            <p className="mb-4 text-2xl font-semibold text-stone-900 dark:text-stone-50">{formatTime(attendance!.check_in_time)}</p>
            <Button onClick={handleCheckOut} disabled={working} variant="danger" className="w-full py-4 text-lg">
              {working ? 'Checking out…' : 'Check Out'}
            </Button>
          </>
        ) : attendance?.check_out_time ? (
          <>
            <p className="text-sm text-stone-500">Shift complete</p>
            <p className="mb-1 text-lg font-medium text-stone-900 dark:text-stone-50">
              {formatTime(attendance.check_in_time)} → {formatTime(attendance.check_out_time)}
            </p>
            <div className="mt-2 flex justify-center"><StatusBadge status={attendance.status} /></div>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-stone-500">You haven't checked in today</p>
            <Button onClick={handleCheckIn} disabled={working} className="w-full py-4 text-lg">
              {working ? 'Checking in…' : 'Check In'}
            </Button>
          </>
        )}
      </Card>

      <Card>
        <p className="text-sm text-stone-500">Paid leave this month</p>
        <p className="text-lg font-medium text-stone-900 dark:text-stone-50">
          You have <span className="text-accent-600">{Math.max(available ?? 0, 0)}</span> paid leave(s) remaining this month
        </p>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Today's to-do</p>
        <form onSubmit={quickAddTask} className="mb-2 flex gap-2">
          <input
            placeholder="Quick add a task"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900"
          />
          <Button type="submit" className="px-3 py-2 text-sm">Add</Button>
        </form>
        <ul className="space-y-1.5">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleTodo(t)} className="h-4 w-4 accent-accent-600" />
              <span className={t.status === 'done' ? 'text-stone-400 line-through' : 'text-stone-900 dark:text-stone-50'}>{t.title}</span>
            </li>
          ))}
          {todos.length === 0 && <p className="text-sm text-stone-500">No tasks yet today.</p>}
        </ul>
      </Card>
    </div>
  )
}
