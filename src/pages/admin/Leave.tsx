import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { formatDate } from '../../lib/dates'
import { Card, SectionLabel, Button, Banner, Input, Chip, PageSkeleton, EmptyState } from '../../components/ui'
import type { Employee, LeaveBalance, LeaveRequest } from '../../types/database'

export default function AdminLeave() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
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
      supabase.from('leave_requests').select('*').order('created_at', { ascending: false }).limit(30),
    ])
    setEmployees(emps ?? [])
    setBalances((bal.data as LeaveBalance[]) ?? [])
    setRequests(reqs ?? [])
    setLoading(false)
  }, [month, year])

  useEffect(() => {
    load()
  }, [load])

  // Approving a conflict-auto-rejected request IS the admin override.
  async function decide(req: LeaveRequest, approve: boolean) {
    setError(null)
    const { error } = await supabase
      .from('leave_requests')
      .update({ status: approve ? 'approved' : 'rejected' })
      .eq('id', req.id)
    if (error) setError(error.message)
    await load()
  }

  async function saveAdjustment(balanceId: string) {
    if (!note.trim()) {
      setError('A reason note is required for balance adjustments.')
      return
    }
    const bal = balances.find((b) => b.id === balanceId)
    if (bal) {
      await supabase
        .from('leave_balances')
        .update({ paid_leaves_used: Math.max(bal.paid_leaves_used + delta, 0), notes: note.trim() })
        .eq('id', balanceId)
    }
    setAdjusting(null)
    setNote('')
    setDelta(0)
    setError(null)
    await load()
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Leave</h1>
      {error && <Banner tone="error">{error}</Banner>}

      <Card>
        <SectionLabel>Balances — {format(now, 'MMMM yyyy')}</SectionLabel>
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {employees.map((emp) => {
            const bal = balances.find((b) => b.employee_id === emp.id)
            const available = bal ? bal.paid_leaves_entitled - bal.carried_deduction - bal.paid_leaves_used : null
            return (
              <li key={emp.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{emp.name}</p>
                    <p className="text-xs text-ink-soft">
                      Used {bal?.paid_leaves_used ?? 0} · Carried deficit {bal?.carried_deduction ?? 0}
                    </p>
                  </div>
                  <p className="font-display text-2xl text-gold-600">{available !== null ? Math.max(available, 0) : '—'}</p>
                </div>

                {adjusting === bal?.id ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-hairline p-3 dark:border-hairline-dark">
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={() => setDelta((d) => d - 1)}>
                        −1 used
                      </Button>
                      <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={() => setDelta((d) => d + 1)}>
                        +1 used
                      </Button>
                      <span className="text-xs text-ink-soft">Δ {delta}</span>
                    </div>
                    <Input placeholder="Reason (required)" value={note} onChange={(e) => setNote(e.target.value)} className="!py-1.5 text-xs" />
                    <div className="flex gap-2">
                      <Button className="!px-3 !py-1.5 text-xs" onClick={() => saveAdjustment(bal!.id)}>Save</Button>
                      <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => { setAdjusting(null); setDelta(0); setNote('') }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  bal && (
                    <button className="mt-1 text-xs font-medium text-gold-600" onClick={() => setAdjusting(bal.id)}>
                      Adjust balance
                    </button>
                  )
                )}
                {bal?.notes && <p className="mt-1 text-xs text-ink-soft">Note: {bal.notes}</p>}
                {bal?.fifth_week_off_consumed && (
                  <p className="mt-1 text-xs text-bronze-500">5-week month: extra week off consumed the paid leave (auto).</p>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <SectionLabel>Requests</SectionLabel>
        {requests.length === 0 && <EmptyState>No requests yet.</EmptyState>}
        <ul className="space-y-2.5">
          {requests.map((r) => {
            const emp = employees.find((e) => e.id === r.employee_id)
            return (
              <li key={r.id} className="rounded-xl border border-hairline p-3 dark:border-hairline-dark">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{emp?.name ?? 'Employee'}</p>
                    <p className="text-xs text-ink-soft">
                      {formatDate(r.requested_date)} · {r.leave_type === 'paid_leave' ? 'Paid' : 'Unpaid'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Chip tone={r.status === 'approved' ? 'sage' : r.status === 'rejected' ? 'brick' : 'neutral'}>{r.status}</Chip>
                    {r.status === 'pending' && (
                      <>
                        <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={() => decide(r, false)}>Reject</Button>
                        <Button className="!px-2.5 !py-1 text-xs" onClick={() => decide(r, true)}>Approve</Button>
                      </>
                    )}
                    {r.status === 'rejected' && (
                      <Button className="!px-2.5 !py-1 text-xs" onClick={() => decide(r, true)}>Approve anyway</Button>
                    )}
                  </div>
                </div>
                {r.admin_note && <p className="mt-1.5 text-xs text-ink-soft">{r.admin_note}</p>}
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
