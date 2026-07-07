import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, Banner } from '../../components/ui'
import MonthCalendar from '../../components/MonthCalendar'
import { formatDate } from '../../lib/dates'
import type { Attendance, LeaveBalance, LeaveRequest, LeaveType, WeekdayName } from '../../types/database'

const WEEKDAYS: WeekdayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export default function EmployeeLeave() {
  const { employee, refreshEmployee } = useAuth()
  const now = new Date()
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [requestDate, setRequestDate] = useState('')
  const [leaveType, setLeaveType] = useState<LeaveType>('paid_leave')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!employee) return
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)
    const backfillEnd = subDays(now, 1)
    if (backfillEnd >= monthStart) {
      await supabase.rpc('ensure_my_attendance_status_range', {
        p_start: format(monthStart, 'yyyy-MM-dd'),
        p_end: format(backfillEnd, 'yyyy-MM-dd'),
      })
    }
    const [{ data: att }, { data: bal }, { data: reqs }] = await Promise.all([
      supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', employee.id)
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd')),
      supabase.rpc('get_my_leave_balance', { p_month: now.getMonth() + 1, p_year: now.getFullYear() }),
      supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', employee.id)
        .order('requested_date', { ascending: false })
        .limit(10),
    ])
    setAttendance(att ?? [])
    setBalance((bal as LeaveBalance) ?? null)
    setRequests(reqs ?? [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  async function handleRequest(e: FormEvent) {
    e.preventDefault()
    if (!employee || !requestDate) return
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const { data, error } = await supabase
      .from('leave_requests')
      .insert({ employee_id: employee.id, requested_date: requestDate, leave_type: leaveType, status: 'pending' })
      .select()
      .single()
    setSubmitting(false)
    if (error) {
      setError('Could not submit request: ' + error.message)
    } else if (data.status === 'rejected') {
      setError(data.admin_note ?? 'Two employees are already off on this date.')
      setRequestDate('')
      await load()
    } else {
      setSuccess('Leave request submitted.')
      setRequestDate('')
      await load()
    }
  }

  async function handleWeeklyOffChange(day: WeekdayName) {
    await supabase.rpc('set_own_weekly_off_day', { p_day: day })
    await refreshEmployee()
  }

  const available = balance ? balance.paid_leaves_entitled - balance.carried_deduction - balance.paid_leaves_used : 0

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Leave</h1>

      <Card>
        <p className="text-sm text-stone-500">This month</p>
        <p className="font-medium text-stone-900 dark:text-stone-50">
          You have <span className="text-accent-600">{Math.max(available, 0)}</span> paid leave(s) remaining this month
        </p>
        {balance && balance.carried_deduction > 0 && (
          <p className="mt-1 text-xs text-red-600">1 paid leave carried forward as deficit from last month's 5th week off.</p>
        )}
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Calendar</p>
        <MonthCalendar
          month={now.getMonth() + 1}
          year={now.getFullYear()}
          attendance={attendance}
          weeklyOffDay={employee?.weekly_off_day ?? null}
        />
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">My weekly off day</p>
        <select
          value={employee?.weekly_off_day ?? ''}
          onChange={(e) => handleWeeklyOffChange(e.target.value as WeekdayName)}
          className="w-full rounded-xl border border-stone-300 px-3 py-2.5 capitalize outline-none dark:border-stone-700 dark:bg-stone-900"
        >
          <option value="" disabled>Choose a day</option>
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Request a day off</p>
        {error && <div className="mb-2"><Banner tone="error">{error}</Banner></div>}
        {success && <div className="mb-2"><Banner tone="success">{success}</Banner></div>}
        <form onSubmit={handleRequest} className="space-y-3">
          <input
            type="date"
            required
            min={format(now, 'yyyy-MM-dd')}
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none dark:border-stone-700 dark:bg-stone-900"
          />
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            className="w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none dark:border-stone-700 dark:bg-stone-900"
          >
            <option value="paid_leave">Paid leave</option>
            <option value="unpaid_leave">Unpaid leave</option>
          </select>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Submitting…' : 'Submit request'}
          </Button>
        </form>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">My requests</p>
        {requests.length === 0 && <p className="text-sm text-stone-500">No requests yet.</p>}
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span>{formatDate(r.requested_date)} · {r.leave_type === 'paid_leave' ? 'Paid' : 'Unpaid'}</span>
              <span
                className={
                  r.status === 'approved'
                    ? 'text-green-600'
                    : r.status === 'rejected'
                    ? 'text-red-600'
                    : 'text-stone-500'
                }
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
