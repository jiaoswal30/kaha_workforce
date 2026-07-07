import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { todayISO, formatTime, formatDate } from '../../lib/dates'
import { Card, Button, StatusBadge, EmptyState } from '../../components/ui'
import type { Attendance, DailyLog, Employee, InventoryNote, LeaveRequest, Todo } from '../../types/database'

export default function AdminHome() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [pending, setPending] = useState<LeaveRequest[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [notes, setNotes] = useState<InventoryNote[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: emps }, { data: att }, { data: reqs }, { data: t }, { data: l }, { data: n }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('attendance').select('*').eq('date', todayISO()),
      supabase.from('leave_requests').select('*').eq('status', 'pending').order('requested_date'),
      supabase.from('todos').select('*').eq('date', todayISO()),
      supabase.from('daily_logs').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
      supabase.from('inventory_notes').select('*').eq('is_resolved', false).order('created_at', { ascending: false }),
    ])
    setEmployees(emps ?? [])
    setAttendance(att ?? [])
    setPending(reqs ?? [])
    setTodos(t ?? [])
    setLogs(l ?? [])
    setNotes(n ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function decide(req: LeaveRequest, approve: boolean) {
    setBusyId(req.id)
    await supabase.from('leave_requests').update({ status: approve ? 'approved' : 'rejected' }).eq('id', req.id)
    setBusyId(null)
    await load()
  }

  const byEmployee = new Map(attendance.map((a) => [a.employee_id, a]))

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Today's overview</h1>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Attendance</p>
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {employees.map((emp) => {
            const a = byEmployee.get(emp.id)
            return (
              <li key={emp.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium text-stone-900 dark:text-stone-50">{emp.name}</p>
                  <p className="text-xs text-stone-500">
                    {a?.check_in_time ? `In ${formatTime(a.check_in_time)}` : 'Not checked in'}
                    {a?.check_out_time ? ` · Out ${formatTime(a.check_out_time)}` : ''}
                    {a?.is_late ? ' · Late' : ''}
                  </p>
                </div>
                <StatusBadge status={a?.status ?? null} />
              </li>
            )
          })}
          {employees.length === 0 && <p className="text-sm text-stone-500">No employees yet.</p>}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Pending leave requests</p>
        {pending.length === 0 && <p className="text-sm text-stone-500">Nothing pending.</p>}
        <ul className="space-y-2">
          {pending.map((r) => {
            const emp = employees.find((e) => e.id === r.employee_id)
            return (
              <li key={r.id} className="flex items-center justify-between rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-900">
                <div>
                  <p className="font-medium text-stone-900 dark:text-stone-50">{emp?.name ?? 'Employee'}</p>
                  <p className="text-xs text-stone-500">{r.requested_date} · {r.leave_type === 'paid_leave' ? 'Paid' : 'Unpaid'}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={busyId === r.id} onClick={() => decide(r, false)} className="px-3 py-1.5 text-xs">
                    Reject
                  </Button>
                  <Button disabled={busyId === r.id} onClick={() => decide(r, true)} className="px-3 py-1.5 text-xs">
                    Approve
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Task completion today</p>
        <ul className="space-y-1.5">
          {employees.map((emp) => {
            const empTodos = todos.filter((t) => t.employee_id === emp.id)
            const done = empTodos.filter((t) => t.status === 'done').length
            return (
              <li key={emp.id} className="flex items-center justify-between text-sm">
                <span className="text-stone-900 dark:text-stone-50">{emp.name}</span>
                <span className="text-stone-500">{done}/{empTodos.length}</span>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Recent daily logs</p>
        {logs.length === 0 && <EmptyState>No logs yet.</EmptyState>}
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {logs.map((log) => {
            const emp = employees.find((e) => e.id === log.employee_id)
            return (
              <li key={log.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-stone-900 dark:text-stone-50">{emp?.name ?? 'Employee'}</span>
                  <span className="text-xs text-stone-500">{formatDate(log.date)}</span>
                </div>
                {log.key_activities && <p className="text-xs text-stone-500">{log.key_activities}</p>}
              </li>
            )
          })}
        </ul>
      </Card>

      <Link to="/notes">
        <Card>
          <p className="mb-1 text-sm font-medium text-stone-700 dark:text-stone-300">Unresolved inventory notes</p>
          {notes.length === 0 ? (
            <p className="text-sm text-stone-500">All clear.</p>
          ) : (
            <ul className="space-y-1">
              {notes.slice(0, 3).map((n) => (
                <li key={n.id} className="text-sm text-stone-700 dark:text-stone-300">{n.note}</li>
              ))}
            </ul>
          )}
          {notes.length > 3 && <p className="mt-1 text-xs text-accent-600">+{notes.length - 3} more</p>}
        </Card>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/admin/attendance"><Card className="text-center text-sm font-medium">Attendance History</Card></Link>
        <Link to="/admin/leave"><Card className="text-center text-sm font-medium">Leave Management</Card></Link>
        <Link to="/admin/tasks"><Card className="text-center text-sm font-medium">Employee Performance</Card></Link>
        <Link to="/announcements"><Card className="text-center text-sm font-medium">Announcements</Card></Link>
      </div>
    </div>
  )
}
