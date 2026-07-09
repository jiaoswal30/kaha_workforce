import { useCallback, useEffect, useState } from 'react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, PageSkeleton, EmptyState } from '../../components/ui'
import { ComplaintThread, StatusChip, CATEGORY_LABELS } from '../../components/ComplaintThread'
import type { Complaint, ComplaintStatus, Employee } from '../../types/database'

const FILTERS: { value: ComplaintStatus | 'all'; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_discussion', label: 'In discussion' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
]

export default function AdminConcerns() {
  const { employee: admin } = useAuth()
  const [complaints, setComplaints] = useState<Complaint[] | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filter, setFilter] = useState<ComplaintStatus | 'all'>('open')
  const [open, setOpen] = useState<Complaint | null>(null)

  const load = useCallback(async () => {
    const [{ data: c }, { data: emps }] = await Promise.all([
      supabase.from('complaints').select('*').order('created_at', { ascending: false }),
      supabase.from('employees').select('*'),
    ])
    setComplaints(c ?? [])
    setEmployees(emps ?? [])
    if (open) {
      const refreshed = (c ?? []).find((x: Complaint) => x.id === open.id)
      if (refreshed) setOpen(refreshed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? 'Employee'
  }

  async function setStatus(complaint: Complaint, status: ComplaintStatus) {
    await supabase.from('complaints').update({ status }).eq('id', complaint.id)
    const label = status === 'resolved' ? 'Marked resolved by admin' : status === 'in_discussion' ? 'Moved to discussion by admin' : 'Reopened by admin'
    await supabase.from('complaint_messages').insert({
      complaint_id: complaint.id,
      sender_id: admin?.id,
      body: label,
      is_system: true,
    })
    setOpen({ ...complaint, status })
    await load()
  }

  if (complaints === null) return <PageSkeleton />

  if (open) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setOpen(null); load() }}
          className="flex items-center gap-1 text-sm text-ink-soft hover:text-ink dark:hover:text-ivory-dark-text"
        >
          <ChevronLeft size={16} strokeWidth={1.5} /> All concerns
        </button>
        <Card>
          <div className="mb-3 border-b border-hairline pb-3 dark:border-hairline-dark">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink dark:text-ivory-dark-text">{open.subject}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {employeeName(open.employee_id)} · {CATEGORY_LABELS[open.category]} · {format(new Date(open.created_at), 'd MMM yyyy')}
                </p>
              </div>
              <StatusChip status={open.status} />
            </div>
            <div className="mt-3 flex gap-2">
              {open.status !== 'in_discussion' && open.status !== 'resolved' && (
                <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setStatus(open, 'in_discussion')}>
                  Start discussion
                </Button>
              )}
              {open.status !== 'resolved' ? (
                <Button className="!py-1.5 text-xs" onClick={() => setStatus(open, 'resolved')}>
                  Mark resolved
                </Button>
              ) : (
                <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setStatus(open, 'open')}>
                  Reopen
                </Button>
              )}
            </div>
          </div>
          <ComplaintThread complaint={open} onChanged={load} />
        </Card>
      </div>
    )
  }

  const filtered = complaints.filter((c) => filter === 'all' || c.status === filter)

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Concerns</h1>

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.value
                ? 'border-gold-500 bg-gold-tint text-gold-600'
                : 'border-hairline text-ink-soft dark:border-hairline-dark'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        {filtered.length === 0 && <EmptyState>Nothing here.</EmptyState>}
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {filtered.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOpen(c)} className="flex w-full items-center justify-between gap-2 py-3 text-left">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink dark:text-ivory-dark-text">{c.subject}</p>
                  <p className="text-xs text-ink-soft">
                    {employeeName(c.employee_id)} · {CATEGORY_LABELS[c.category]} ·{' '}
                    {formatDistanceToNowStrict(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
                <StatusChip status={c.status} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
