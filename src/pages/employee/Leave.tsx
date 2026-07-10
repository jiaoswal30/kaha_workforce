import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { format, startOfMonth, endOfMonth, subDays, subMonths, addMonths } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, SectionLabel, Button, Banner, Input, Select, Textarea, Chip, PageSkeleton } from '../../components/ui'
import MonthCalendar from '../../components/MonthCalendar'
import { formatDate } from '../../lib/dates'
import type { Attendance, LeaveBalance, LeaveRequest, LeaveType, WeekdayName } from '../../types/database'

const WEEKDAYS: WeekdayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export default function EmployeeLeave() {
  const { employee, refreshEmployee } = useAuth()
  const now = new Date()
  const [calMonth, setCalMonth] = useState(startOfMonth(now))
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [requestDate, setRequestDate] = useState('')
  const [leaveType, setLeaveType] = useState<LeaveType>('paid_leave')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!employee) return
    const monthStart = calMonth
    const monthEnd = endOfMonth(calMonth)
    const backfillEnd = subDays(new Date(), 1)
    if (backfillEnd >= monthStart) {
      await supabase.rpc('ensure_my_attendance_status_range', {
        p_start: format(monthStart, 'yyyy-MM-dd'),
        p_end: format(backfillEnd < monthEnd ? backfillEnd : monthEnd, 'yyyy-MM-dd'),
      })
    }
    const [{ data: att }, { data: bal }, { data: reqs }] = await Promise.all([
      supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', employee.id)
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd')),
      supabase.rpc('get_my_leave_balance', { p_month: new Date().getMonth() + 1, p_year: new Date().getFullYear() }),
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
  }, [employee, calMonth])

  useEffect(() => {
    load()
  }, [load])

  async function handleRequest(e: FormEvent) {
    e.preventDefault()
    if (!employee || !requestDate) return
    setError(null)
    setSuccess(null)
    if (leaveType === 'unpaid_leave' && !reason.trim()) {
      setError('Please give a reason for unpaid leave.')
      return
    }
    setSubmitting(true)
    const { data, error } = await supabase
      .from('leave_requests')
      .insert({
        employee_id: employee.id,
        requested_date: requestDate,
        leave_type: leaveType,
        status: 'pending',
        reason: leaveType === 'unpaid_leave' ? reason.trim() : null,
      })
      .select()
      .single()
    setSubmitting(false)
    if (error) {
      setError('Could not submit request: ' + error.message)
    } else if (data.status === 'rejected') {
      setError('Two employees are already off that date — sent to admin for override.')
      setRequestDate('')
      setReason('')
      await load()
    } else {
      setSuccess('Leave request submitted.')
      setRequestDate('')
      setReason('')
      await load()
    }
  }

  async function handleWeeklyOffChange(day: WeekdayName) {
    await supabase.rpc('set_own_weekly_off_day', { p_day: day })
    await refreshEmployee()
    await load()
  }

  const available = balance ? balance.paid_leaves_entitled - balance.carried_deduction - balance.paid_leaves_used : 0
  const isCurrentMonth = format(calMonth, 'yyyy-MM') === format(now, 'yyyy-MM')

  useEffect(() => {
    if (available <= 0 && leaveType === 'paid_leave') setLeaveType('unpaid_leave')
  }, [available, leaveType])

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Leave</h1>

      <Card>
        <SectionLabel>This month</SectionLabel>
        <p className="font-display text-4xl text-gold-600">{Math.max(available, 0)}</p>
        <p className="mt-1 text-xs text-ink-soft">paid leave{available === 1 ? '' : 's'} remaining</p>
        {balance && balance.carried_deduction > 0 && (
          <p className="mt-2 text-xs text-bronze-500">
            A deficit carried forward from last month's 5th week off.
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel>Calendar</SectionLabel>
          <div className="flex items-center gap-1">
            <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="p-1 text-ink-soft hover:text-ink dark:hover:text-ivory-dark-text">
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <span className="min-w-24 text-center text-xs font-medium text-ink dark:text-ivory-dark-text">
              {format(calMonth, 'MMM yyyy')}
            </span>
            <button
              onClick={() => setCalMonth(addMonths(calMonth, 1))}
              disabled={isCurrentMonth}
              className="p-1 text-ink-soft hover:text-ink disabled:opacity-30 dark:hover:text-ivory-dark-text"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
        <MonthCalendar
          month={calMonth.getMonth() + 1}
          year={calMonth.getFullYear()}
          attendance={attendance}
          weeklyOffDay={employee?.weekly_off_day ?? null}
        />
      </Card>

      <Card>
        <SectionLabel>My weekly off</SectionLabel>
        <Select
          value={employee?.weekly_off_day ?? ''}
          onChange={(e) => handleWeeklyOffChange(e.target.value as WeekdayName)}
          className="capitalize"
        >
          <option value="" disabled>Choose a day</option>
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </Select>
        <p className="mt-2 text-xs text-ink-soft">Your fixed day off each week. Changes apply from next week.</p>
      </Card>

      <Card>
        <SectionLabel>Request a day off</SectionLabel>
        {error && <div className="mb-3"><Banner tone="warning">{error}</Banner></div>}
        {success && <div className="mb-3"><Banner tone="success">{success}</Banner></div>}
        <form onSubmit={handleRequest} className="space-y-3">
          <Input
            type="date"
            required
            min={format(now, 'yyyy-MM-dd')}
            value={requestDate}
            onChange={(e) => setRequestDate(e.target.value)}
          />
          <Select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
            <option value="paid_leave" disabled={available <= 0}>
              Paid leave{available <= 0 ? ' — used this month' : ''}
            </option>
            <option value="unpaid_leave">Unpaid leave</option>
          </Select>
          {leaveType === 'paid_leave' ? (
            <p className="text-xs text-ink-soft">Your one paid leave a month — no reason needed.</p>
          ) : (
            <Textarea
              rows={2}
              required
              placeholder="Reason for unpaid leave"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <Button type="submit" busy={submitting} className="w-full">Submit request</Button>
        </form>
      </Card>

      <Card>
        <SectionLabel>My requests</SectionLabel>
        {requests.length === 0 && <p className="text-sm text-ink-soft">No requests yet.</p>}
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {requests.map((r) => (
            <li key={r.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-ink dark:text-ivory-dark-text">
                  {formatDate(r.requested_date)} · {r.leave_type === 'paid_leave' ? 'Paid' : 'Unpaid'}
                </span>
                <Chip tone={r.status === 'approved' ? 'sage' : r.status === 'rejected' ? 'brick' : 'neutral'}>
                  {r.status}
                </Chip>
              </div>
              {r.admin_note && <p className="mt-1 text-xs text-ink-soft">{r.admin_note}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
