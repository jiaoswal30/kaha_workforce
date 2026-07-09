import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { MapPin, CalendarDays, Users, Megaphone } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { todayISO, formatTime, formatDate } from '../../lib/dates'
import { Card, SectionLabel, Button, StatusBadge, Chip, EmptyState, PageSkeleton } from '../../components/ui'
import PhotoThumb from '../../components/PhotoThumb'
import type { Attendance, Complaint, DailyLog, Employee, InventoryNote, LeaveRequest, Todo } from '../../types/database'

export default function AdminHome() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [pending, setPending] = useState<LeaveRequest[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [notes, setNotes] = useState<InventoryNote[]>([])
  const [concerns, setConcerns] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [emps, att, reqs, t, l, n, c] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('attendance').select('*').eq('date', todayISO()),
      supabase.from('leave_requests').select('*').eq('status', 'pending').order('requested_date'),
      supabase.from('todos').select('*').eq('date', todayISO()),
      supabase.from('daily_logs').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
      supabase.from('inventory_notes').select('*').eq('is_resolved', false).order('created_at', { ascending: false }),
      supabase.from('complaints').select('*').neq('status', 'resolved').order('created_at', { ascending: false }),
    ])
    setEmployees(emps.data ?? [])
    setAttendance(att.data ?? [])
    setPending(reqs.data ?? [])
    setTodos(t.data ?? [])
    setLogs(l.data ?? [])
    setNotes(n.data ?? [])
    setConcerns(c.data ?? [])
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

  if (loading) return <PageSkeleton />

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Today</h1>
        <p className="mt-0.5 text-sm text-ink-soft">{format(new Date(), 'EEEE, d MMMM')}</p>
      </div>

      <Card>
        <SectionLabel>Attendance</SectionLabel>
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {employees.map((emp) => {
            const a = byEmployee.get(emp.id)
            return (
              <li key={emp.id} className="flex items-center justify-between gap-3 py-2.5">
                <PhotoThumb photo={a?.check_in_photo ?? null} label={`${emp.name} — check-in`} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink dark:text-ivory-dark-text">
                    {emp.name}
                    {a?.is_late && <Chip tone="bronze">Late</Chip>}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {a?.check_in_time ? `In ${formatTime(a.check_in_time)}` : 'Not checked in'}
                    {a?.check_out_time ? ` · Out ${formatTime(a.check_out_time)}` : ''}
                  </p>
                </div>
                <StatusBadge status={a?.status ?? null} />
              </li>
            )
          })}
          {employees.length === 0 && <p className="py-2 text-sm text-ink-soft">No employees yet.</p>}
        </ul>
      </Card>

      <Card>
        <SectionLabel>Pending leave requests</SectionLabel>
        {pending.length === 0 && <p className="text-sm text-ink-soft">Nothing pending.</p>}
        <ul className="space-y-2.5">
          {pending.map((r) => {
            const emp = employees.find((e) => e.id === r.employee_id)
            return (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-hairline p-3 dark:border-hairline-dark">
                <div>
                  <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{emp?.name ?? 'Employee'}</p>
                  <p className="text-xs text-ink-soft">
                    {formatDate(r.requested_date)} · {r.leave_type === 'paid_leave' ? 'Paid' : 'Unpaid'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="secondary" disabled={busyId === r.id} onClick={() => decide(r, false)} className="!px-3 !py-1.5 text-xs">
                    Reject
                  </Button>
                  <Button disabled={busyId === r.id} onClick={() => decide(r, true)} className="!px-3 !py-1.5 text-xs">
                    Approve
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      {concerns.length > 0 && (
        <Link to="/admin/concerns" className="block">
          <Card className="!border-bronze-500/40">
            <SectionLabel>Open concerns</SectionLabel>
            <ul className="space-y-1">
              {concerns.slice(0, 3).map((c) => (
                <li key={c.id} className="truncate text-sm text-ink dark:text-ivory-dark-text">
                  {employees.find((e) => e.id === c.employee_id)?.name}: {c.subject}
                </li>
              ))}
            </ul>
            {concerns.length > 3 && <p className="mt-1.5 text-xs text-gold-600">+{concerns.length - 3} more</p>}
          </Card>
        </Link>
      )}

      <Card>
        <SectionLabel>Task pulse</SectionLabel>
        <ul className="space-y-2.5">
          {employees.map((emp) => {
            const empTodos = todos.filter((t) => t.employee_id === emp.id)
            const done = empTodos.filter((t) => t.status === 'done').length
            const frac = empTodos.length > 0 ? done / empTodos.length : 0
            return (
              <li key={emp.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink dark:text-ivory-dark-text">{emp.name}</span>
                  <span className="text-xs text-ink-soft">{done}/{empTodos.length}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-hairline dark:bg-hairline-dark">
                  <div className="h-full rounded-full bg-gold-500 transition-[width] duration-500" style={{ width: `${frac * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <SectionLabel>Latest logs</SectionLabel>
        {logs.length === 0 && <EmptyState>No logs yet.</EmptyState>}
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {logs.map((log) => {
            const emp = employees.find((e) => e.id === log.employee_id)
            return (
              <li key={log.id} className="py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink dark:text-ivory-dark-text">{emp?.name ?? 'Employee'}</span>
                  <span className="text-xs text-ink-soft">{formatDate(log.date)}</span>
                </div>
                {log.key_activities && <p className="mt-0.5 truncate text-xs text-ink-soft">{log.key_activities}</p>}
              </li>
            )
          })}
        </ul>
        <Link to="/admin/logs" className="mt-2 block text-xs font-medium text-gold-600">View all →</Link>
      </Card>

      {notes.length > 0 && (
        <Link to="/notes" className="block">
          <Card>
            <SectionLabel>Unresolved inventory notes</SectionLabel>
            <ul className="space-y-1">
              {notes.slice(0, 3).map((n) => (
                <li key={n.id} className="truncate text-sm text-ink dark:text-ivory-dark-text">{n.note}</li>
              ))}
            </ul>
            {notes.length > 3 && <p className="mt-1.5 text-xs text-gold-600">+{notes.length - 3} more</p>}
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
        <QuickLink to="/admin/attendance" icon={<MapPin size={16} strokeWidth={1.5} />} label="Attendance" />
        <QuickLink to="/admin/leave" icon={<CalendarDays size={16} strokeWidth={1.5} />} label="Leave" />
        <QuickLink to="/admin/team" icon={<Users size={16} strokeWidth={1.5} />} label="Team" />
        <QuickLink to="/announcements" icon={<Megaphone size={16} strokeWidth={1.5} />} label="Announcements" />
      </div>
    </div>
  )
}

function QuickLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-center gap-2 rounded-[14px] border border-hairline bg-white py-3.5 text-sm font-medium text-ink transition-colors hover:border-gold-400 dark:border-hairline-dark dark:bg-espresso-2 dark:text-ivory-dark-text"
    >
      <span className="text-gold-600">{icon}</span>
      {label}
    </Link>
  )
}
