import { useEffect, useState, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { formatDate, formatDay, formatTime, hoursWorked } from '../../lib/dates'
import { punctualityOf, leftEarly, PUNCTUALITY_LABELS } from '../../lib/punctuality'
import { Card, SectionLabel, Button, StatusBadge, Chip, Input, PageSkeleton, EmptyState } from '../../components/ui'
import PhotoThumb from '../../components/PhotoThumb'
import type { Attendance, Employee, LeaveBalance, StoreConfig } from '../../types/database'

const DOT_COLORS = { green: 'bg-sage-500', yellow: 'bg-bronze-500', red: 'bg-brick-500' }

export default function AdminAttendance() {
  const now = new Date()
  const [start, setStart] = useState(format(startOfMonth(now), 'yyyy-MM-dd'))
  const [end, setEnd] = useState(format(now, 'yyyy-MM-dd'))
  const [employees, setEmployees] = useState<Employee[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const backfillEnd = subDays(new Date(), 1)
    if (format(backfillEnd, 'yyyy-MM-dd') >= start) {
      await supabase.rpc('ensure_attendance_status_range', {
        p_start: start,
        p_end: format(backfillEnd, 'yyyy-MM-dd') < end ? format(backfillEnd, 'yyyy-MM-dd') : end,
      })
    }
    const rangeStartDate = new Date(start + 'T00:00:00')
    const [{ data: emps }, { data: att }, bal, { data: cfg }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('attendance').select('*').gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.rpc('get_all_leave_balances', {
        p_month: rangeStartDate.getMonth() + 1,
        p_year: rangeStartDate.getFullYear(),
      }),
      supabase.from('store_config').select('*').limit(1).maybeSingle(),
    ])
    setEmployees(emps ?? [])
    setAttendance(att ?? [])
    setBalances((bal.data as LeaveBalance[]) ?? [])
    setConfig(cfg ?? null)
    setLoading(false)
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? 'Unknown'
  }

  function setPreset(preset: 'this' | 'last') {
    const base = preset === 'this' ? now : subMonths(now, 1)
    setStart(format(startOfMonth(base), 'yyyy-MM-dd'))
    setEnd(preset === 'this' ? format(now, 'yyyy-MM-dd') : format(endOfMonth(base), 'yyyy-MM-dd'))
  }

  function exportCSV() {
    const header = [
      'Employee', 'Date', 'Day', 'Check-in', 'Check-out', 'Hours',
      'Punctuality', 'Left early (before cutoff)', 'Late', 'Half day', 'Status',
    ]
    const rows = attendance.map((a) => {
      const p = punctualityOf(a, config)
      const early = config && a.check_out_time ? leftEarly(a.check_out_time, config) : false
      return [
        employeeName(a.employee_id),
        a.date,
        formatDay(a.date),
        a.check_in_time ? formatTime(a.check_in_time) : '',
        a.check_out_time ? formatTime(a.check_out_time) : '',
        hoursWorked(a.check_in_time, a.check_out_time),
        p ? `${PUNCTUALITY_LABELS[p]} (${p})` : '',
        early ? 'Yes' : 'No',
        a.is_late ? 'Yes' : 'No',
        a.is_half_day ? 'Yes' : 'No',
        a.status ?? '',
      ]
    })
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

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Attendance</h1>

      <Card>
        <div className="mb-3 flex gap-1.5">
          <button
            onClick={() => setPreset('this')}
            className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-gold-400 dark:border-hairline-dark"
          >
            This month
          </button>
          <button
            onClick={() => setPreset('last')}
            className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-gold-400 dark:border-hairline-dark"
          >
            Last month
          </button>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <p className="label-caps mb-1">From</p>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="!py-2 text-xs" />
          </div>
          <div className="flex-1">
            <p className="label-caps mb-1">To</p>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="!py-2 text-xs" />
          </div>
          <Button variant="secondary" onClick={exportCSV} className="!px-3 !py-2 text-xs">
            Export CSV
          </Button>
        </div>
      </Card>

      <Card>
        <SectionLabel>Punctuality</SectionLabel>
        <p className="mb-3 text-xs text-ink-soft">
          Each square is a worked day, colored by check-in time: green = on time, yellow = within{' '}
          {config?.late_threshold_minutes ?? 10} min of opening, red = later (auto half day). A hollow ring means they
          left before {config ? formatTime(`2000-01-01T${config.checkout_cutoff}`) : '7:30 PM'}.
        </p>
        {employees.map((emp) => {
          const rows = attendance
            .filter((a) => a.employee_id === emp.id && a.check_in_time)
            .sort((a, b) => a.date.localeCompare(b.date))
          const counts = { green: 0, yellow: 0, red: 0 }
          rows.forEach((r) => {
            const p = punctualityOf(r, config)
            if (p) counts[p]++
          })
          return (
            <div key={emp.id} className="mb-4 last:mb-0">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{emp.name}</p>
                <p className="text-[11px] text-ink-soft">
                  <span className="text-sage-500">{counts.green} on time</span> ·{' '}
                  <span className="text-bronze-500">{counts.yellow} late</span> ·{' '}
                  <span className="text-brick-500">{counts.red} very late</span>
                </p>
              </div>
              {rows.length === 0 ? (
                <p className="text-xs text-ink-soft">No check-ins in this range.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((r) => {
                    const p = punctualityOf(r, config)!
                    const early = config && r.check_out_time ? leftEarly(r.check_out_time, config) : false
                    return (
                      <span
                        key={r.id}
                        title={`${formatDate(r.date)} · in ${formatTime(r.check_in_time)}${r.check_out_time ? ` · out ${formatTime(r.check_out_time)}` : ''}`}
                        className={`flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-semibold text-white ${DOT_COLORS[p]} ${
                          early ? 'ring-2 ring-inset ring-white/70' : ''
                        }`}
                      >
                        {Number(r.date.slice(8, 10))}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </Card>

      <Card>
        <SectionLabel>Summary</SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-xs">
            <thead>
              <tr className="text-ink-soft">
                <th className="py-1.5 pr-2 font-medium">Employee</th>
                <th className="py-1.5 pr-2 font-medium">Present</th>
                <th className="py-1.5 pr-2 font-medium">Half</th>
                <th className="py-1.5 pr-2 font-medium">Absent</th>
                <th className="py-1.5 pr-2 font-medium">Paid used</th>
                <th className="py-1.5 pr-2 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.emp.id} className="border-t border-hairline dark:border-hairline-dark">
                  <td className="py-2 pr-2 font-medium text-ink dark:text-ivory-dark-text">{s.emp.name}</td>
                  <td className="py-2 pr-2">{s.present}</td>
                  <td className="py-2 pr-2">{s.halfDays}</td>
                  <td className="py-2 pr-2">{s.absent}</td>
                  <td className="py-2 pr-2">{s.paidUsed}</td>
                  <td className="py-2 pr-2 text-gold-600">{s.remaining !== null ? Math.max(s.remaining, 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionLabel>Entries</SectionLabel>
        {attendance.length === 0 && <EmptyState>No entries in this range.</EmptyState>}
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {attendance.map((a) => {
            const p = punctualityOf(a, config)
            const early = config && a.check_out_time ? leftEarly(a.check_out_time, config) : false
            return (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <div className="flex gap-1.5">
                  <PhotoThumb photo={a.check_in_photo} label={`${employeeName(a.employee_id)} — in, ${formatDate(a.date)}`} />
                  <PhotoThumb photo={a.check_out_photo} label={`${employeeName(a.employee_id)} — out, ${formatDate(a.date)}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink dark:text-ivory-dark-text">
                    {p && <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLORS[p]}`} title={PUNCTUALITY_LABELS[p]} />}
                    {employeeName(a.employee_id)}
                    {p === 'yellow' && <Chip tone="bronze">Late</Chip>}
                    {p === 'red' && <Chip tone="brick">Very late</Chip>}
                    {early && <Chip tone="bronze">Left early</Chip>}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {formatDate(a.date)} ({formatDay(a.date)}) · {formatTime(a.check_in_time)} – {formatTime(a.check_out_time)} ·{' '}
                    {hoursWorked(a.check_in_time, a.check_out_time)}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
