import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { formatDate } from '../../lib/dates'
import { Card, Button, Banner } from '../../components/ui'
import type { Employee, LeaveBalance, LeaveRequest, WeekdayName } from '../../types/database'

const WEEKDAYS: WeekdayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export default function AdminLeave() {
  const now = new Date()
  const [month] = useState(now.getMonth() + 1)
  const [year] = useState(now.getFullYear())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [adjusting, setAdjusting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [delta, setDelta] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: emps }, bal, { data: reqs }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.rpc('get_all_leave_balances', { p_month: month, p_year: year }),
      supabase.from('leave_requests').select('*').order('requested_date', { ascending: false }).limit(30),
    ])
    setEmployees(emps ?? [])
    setBalances((bal.data as LeaveBalance[]) ?? [])
    setRequests(reqs ?? [])
    setLoading(false)
  }, [month, year])

  useEffect(() => {
    load()
  }, [load])

  // Approving a request that was auto-rejected for a date conflict (see
  // check_leave_conflict trigger) is exactly the admin override the spec
  // asks for — no separate flag needed, the admin action itself is the override.
  async function decide(req: LeaveRequest, approve: boolean) {
    setError(null)
    const { error } = await supabase.from('leave_requests').update({ status: approve ? 'approved' : 'rejected' }).eq('id', req.id)
    if (error) setError(error.message)
    await load()
  }

  async function saveAdjustment(balanceId: string) {
    const bal = balances.find((b) => b.id === balanceId)
    if (bal) {
      await supabase
        .from('leave_balances')
        .update({ paid_leaves_used: Math.max(bal.paid_leaves_used + delta, 0), notes: note || bal.notes })
        .eq('id', balanceId)
    }
    setAdjusting(null)
    setNote('')
    setDelta(0)
    await load()
  }

  async function changeWeeklyOff(empId: string, day: WeekdayName) {
    await supabase.from('employees').update({ weekly_off_day: day }).eq('id', empId)
    await load()
  }

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Leave Management</h1>
      {error && <Banner tone="error">{error}</Banner>}

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Balances — {month}/{year}</p>
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {employees.map((emp) => {
            const bal = balances.find((b) => b.employee_id === emp.id)
            const available = bal ? bal.paid_leaves_entitled - bal.carried_deduction - bal.paid_leaves_used : null
            return (
              <li key={emp.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-stone-900 dark:text-stone-50">{emp.name}</p>
                    <p className="text-xs text-stone-500">
                      Balance: {available !== null ? Math.max(available, 0) : '—'} · Used: {bal?.paid_leaves_used ?? 0} · Carried deficit: {bal?.carried_deduction ?? 0}
                    </p>
                  </div>
                  <select
                    value={emp.weekly_off_day ?? ''}
                    onChange={(e) => changeWeeklyOff(emp.id, e.target.value as WeekdayName)}
                    className="rounded-lg border border-stone-300 px-2 py-1 text-xs capitalize dark:border-stone-700 dark:bg-stone-900"
                  >
                    <option value="" disabled>Week off</option>
                    {WEEKDAYS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {adjusting === bal?.id ? (
                  <div className="mt-2 space-y-2 rounded-xl bg-stone-50 p-2 dark:bg-stone-900">
                    <div className="flex gap-2">
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setDelta((d) => d - 1)}>-1 used</Button>
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setDelta((d) => d + 1)}>+1 used</Button>
                      <span className="self-center text-xs text-stone-500">Δ {delta}</span>
                    </div>
                    <input
                      placeholder="Reason note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-900"
                    />
                    <div className="flex gap-2">
                      <Button className="px-3 py-1.5 text-xs" onClick={() => saveAdjustment(bal!.id)}>Save</Button>
                      <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setAdjusting(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  bal && (
                    <button className="mt-1 text-xs text-accent-600 underline" onClick={() => setAdjusting(bal.id)}>
                      Adjust balance
                    </button>
                  )
                )}
                {bal?.notes && <p className="mt-1 text-xs text-stone-400">Note: {bal.notes}</p>}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Leave requests</p>
        <ul className="space-y-2">
          {requests.map((r) => {
            const emp = employees.find((e) => e.id === r.employee_id)
            return (
              <li key={r.id} className="rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-stone-900 dark:text-stone-50">{emp?.name ?? 'Employee'}</p>
                    <p className="text-xs text-stone-500">
                      {formatDate(r.requested_date)} · {r.leave_type === 'paid_leave' ? 'Paid' : 'Unpaid'} · <span className="capitalize">{r.status}</span>
                    </p>
                    {r.admin_note && <p className="mt-0.5 text-xs text-stone-400">{r.admin_note}</p>}
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => decide(r, false)}>Reject</Button>
                      <Button className="px-3 py-1.5 text-xs" onClick={() => decide(r, true)}>Approve</Button>
                    </div>
                  )}
                  {r.status === 'rejected' && (
                    <Button className="px-3 py-1.5 text-xs" onClick={() => decide(r, true)}>Approve anyway</Button>
                  )}
                </div>
              </li>
            )
          })}
          {requests.length === 0 && <p className="text-sm text-stone-500">No requests yet.</p>}
        </ul>
      </Card>
    </div>
  )
}
