import { useEffect, useState, useCallback } from 'react'
import { format, startOfMonth, subDays } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { formatDate, formatDay, formatTime, hoursWorked } from '../../lib/dates'
import { Card, Button, StatusBadge } from '../../components/ui'
import type { Attendance, Employee, LeaveBalance } from '../../types/database'

export default function AdminAttendance() {
  const now = new Date()
  const [start, setStart] = useState(format(startOfMonth(now), 'yyyy-MM-dd'))
  const [end, setEnd] = useState(format(now, 'yyyy-MM-dd'))
  const [employees, setEmployees] = useState<Employee[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const backfillEnd = subDays(now, 1)
    if (format(backfillEnd, 'yyyy-MM-dd') >= start) {
      await supabase.rpc('ensure_attendance_status_range', {
        p_start: start,
        p_end: format(backfillEnd, 'yyyy-MM-dd') < end ? format(backfillEnd, 'yyyy-MM-dd') : end,
      })
    }
    const rangeStartDate = new Date(start + 'T00:00:00')
    const [{ data: emps }, { data: att }, bal] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('attendance').select('*').gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.rpc('get_all_leave_balances', { p_month: rangeStartDate.getMonth() + 1, p_year: rangeStartDate.getFullYear() }),
    ])
    setEmployees(emps ?? [])
    setAttendance(att ?? [])
    setBalances((bal.data as LeaveBalance[]) ?? [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? 'Unknown'
  }

  function exportCSV() {
    const header = ['Employee', 'Date', 'Day', 'Check-in', 'Check-out', 'Hours', 'Late', 'Half day', 'Location verified', 'Status']
    const rows = attendance.map((a) => [
      employeeName(a.employee_id),
      a.date,
      formatDay(a.date),
      a.check_in_time ? formatTime(a.check_in_time) : '',
      a.check_out_time ? formatTime(a.check_out_time) : '',
      hoursWorked(a.check_in_time, a.check_out_time),
      a.is_late ? 'Yes' : 'No',
      a.is_half_day ? 'Yes' : 'No',
      a.check_in_lat ? 'Yes' : 'No',
      a.status ?? '',
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `attendance_${start}_to_${end}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const summaries = employees.map((emp) => {
    const rows = attendance.filter((a) => a.employee_id === emp.id)
    const present = rows.filter((r) => r.status === 'present').length
    const halfDays = rows.filter((r) => r.status === 'half_day').length
    const absent = rows.filter((r) => r.status === 'absent').length
    const paidUsed = rows.filter((r) => r.status === 'paid_leave').length
    const bal = balances.find((b) => b.employee_id === emp.id)
    const remaining = bal ? bal.paid_leaves_entitled - bal.carried_deduction - bal.paid_leaves_used : null
    return { emp, present, halfDays, absent, paidUsed, remaining }
  })

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Attendance History</h1>

      <Card>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-stone-500">From</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-stone-300 px-2 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-stone-500">To</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-stone-300 px-2 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900" />
          </div>
          <Button variant="secondary" onClick={exportCSV} className="px-3 py-2 text-xs">Export CSV</Button>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Monthly summary</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="text-stone-500">
              <tr>
                <th className="py-1 pr-2">Employee</th>
                <th className="py-1 pr-2">Present</th>
                <th className="py-1 pr-2">Half days</th>
                <th className="py-1 pr-2">Absent</th>
                <th className="py-1 pr-2">Paid leaves used</th>
                <th className="py-1 pr-2">Balance left</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.emp.id} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="py-1.5 pr-2 font-medium">{s.emp.name}</td>
                  <td className="py-1.5 pr-2">{s.present}</td>
                  <td className="py-1.5 pr-2">{s.halfDays}</td>
                  <td className="py-1.5 pr-2">{s.absent}</td>
                  <td className="py-1.5 pr-2">{s.paidUsed}</td>
                  <td className="py-1.5 pr-2">{s.remaining !== null ? Math.max(s.remaining, 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Entries</p>
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {attendance.map((a) => (
            <li key={a.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-stone-900 dark:text-stone-50">{employeeName(a.employee_id)}</p>
                <StatusBadge status={a.status} />
              </div>
              <p className="text-xs text-stone-500">
                {formatDate(a.date)} ({formatDay(a.date)}) · In {formatTime(a.check_in_time)} · Out {formatTime(a.check_out_time)} · {hoursWorked(a.check_in_time, a.check_out_time)}
                {a.is_late ? ' · Late' : ''}
              </p>
            </li>
          ))}
          {attendance.length === 0 && <p className="text-sm text-stone-500">No entries in this range.</p>}
        </ul>
      </Card>
    </div>
  )
}
