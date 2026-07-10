import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, SectionLabel, Button, Banner, Input, Select, Textarea, PageSkeleton, EmptyState } from '../../components/ui'
import FollowupItem from '../../components/FollowupItem'
import { sortByUrgency } from '../../lib/followups'
import { todayISO } from '../../lib/dates'
import type { Employee, Followup, FollowupPriority, FollowupTransfer, FollowupType } from '../../types/database'

export default function AdminFollowups() {
  const { employee: admin } = useAuth()
  const [items, setItems] = useState<Followup[] | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [transfers, setTransfers] = useState<FollowupTransfer[]>([])
  const [assignee, setAssignee] = useState('')
  const [type, setType] = useState<FollowupType>('query')
  const [customer, setCustomer] = useState('')
  const [contact, setContact] = useState('')
  const [details, setDetails] = useState('')
  const [priority, setPriority] = useState<FollowupPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: f }, { data: emps }, { data: trans }] = await Promise.all([
      supabase.from('followups').select('*').order('due_date'),
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('followup_transfers').select('*').order('created_at'),
    ])
    setItems(f ?? [])
    setEmployees(emps ?? [])
    setTransfers(trans ?? [])
    if (emps && emps.length > 0) setAssignee((cur) => cur || emps[0].id)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.name?.split(' ')[0] ?? 'Employee'
  }

  /** Chain of custody: [first owner, …, current owner] via transfer history. */
  function chainFor(f: Followup): string[] {
    const trail = transfers.filter((t) => t.followup_id === f.id)
    if (trail.length === 0) return [employeeName(f.employee_id)]
    return [employeeName(trail[0].from_employee), ...trail.map((t) => employeeName(t.to_employee))]
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!assignee || !customer.trim() || !dueDate) return
    setError(null)
    setSaving(true)
    const { error } = await supabase.from('followups').insert({
      employee_id: assignee,
      created_by: admin?.id,
      type,
      customer_name: customer.trim(),
      contact: contact.trim() || null,
      details: details.trim() || null,
      priority,
      due_date: dueDate,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setCustomer('')
    setContact('')
    setDetails('')
    setDueDate('')
    setPriority('medium')
    await load()
  }

  async function markDone(f: Followup) {
    setBusyId(f.id)
    await supabase
      .from('followups')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', f.id)
    setBusyId(null)
    await load()
  }

  if (items === null) return <PageSkeleton />

  const pending = sortByUrgency(items.filter((f) => f.status === 'pending'))
  const completed = items
    .filter((f) => f.status === 'done')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, 20)

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Customer Follow-ups</h1>
      {error && <Banner tone="error">{error}</Banner>}

      <Card>
        <SectionLabel>Assign a follow-up</SectionLabel>
        <form onSubmit={add} className="space-y-2.5">
          <div className="flex gap-2">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
            <Select value={type} onChange={(e) => setType(e.target.value as FollowupType)}>
              <option value="query">Query</option>
              <option value="order">Order</option>
              <option value="conversion">Conversion</option>
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as FollowupPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </div>
          <Input placeholder="Customer name" required value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <Input placeholder="Contact (phone / Instagram) — optional" value={contact} onChange={(e) => setContact(e.target.value)} />
          <Textarea rows={2} placeholder="Details" value={details} onChange={(e) => setDetails(e.target.value)} />
          <div>
            <p className="label-caps mb-1">Follow up by</p>
            <Input type="date" required min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <Button type="submit" busy={saving} className="w-full">Assign</Button>
        </form>
      </Card>

      <Card>
        <SectionLabel>Open ({pending.length})</SectionLabel>
        {pending.length === 0 && <EmptyState>Nothing open — all followed up ✦</EmptyState>}
        <ul className="space-y-2.5">
          {pending.map((f) => (
            <FollowupItem key={f.id} followup={f} chain={chainFor(f)} onDone={markDone} busy={busyId === f.id} />
          ))}
        </ul>
      </Card>

      <Card>
        <SectionLabel>Completed</SectionLabel>
        {completed.length === 0 && <EmptyState>None completed yet.</EmptyState>}
        <ul className="space-y-2.5">
          {completed.map((f) => (
            <FollowupItem key={f.id} followup={f} chain={chainFor(f)} />
          ))}
        </ul>
      </Card>
    </div>
  )
}
