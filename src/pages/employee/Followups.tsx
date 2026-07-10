import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, SectionLabel, Button, Banner, Input, Select, Textarea, PageSkeleton, EmptyState } from '../../components/ui'
import FollowupItem from '../../components/FollowupItem'
import { sortByUrgency, notifyDueFollowups } from '../../lib/followups'
import { enablePush, isPushEnabled, pushSupported } from '../../lib/push'
import { todayISO } from '../../lib/dates'
import type { Employee, Followup, FollowupPriority, FollowupType } from '../../types/database'

export default function EmployeeFollowups() {
  const { employee } = useAuth()
  const [items, setItems] = useState<Followup[] | null>(null)
  const [teammates, setTeammates] = useState<Employee[]>([])
  const [type, setType] = useState<FollowupType>('query')
  const [customer, setCustomer] = useState('')
  const [contact, setContact] = useState('')
  const [details, setDetails] = useState('')
  const [priority, setPriority] = useState<FollowupPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    isPushEnabled().then(setPushOn)
  }, [])

  const load = useCallback(async () => {
    if (!employee) return
    const [{ data }, { data: emps }] = await Promise.all([
      supabase.from('followups').select('*').eq('employee_id', employee.id).order('due_date'),
      supabase.from('employees').select('*').eq('role', 'employee').neq('id', employee.id).order('name'),
    ])
    const list = data ?? []
    setItems(list)
    setTeammates(emps ?? [])
    notifyDueFollowups(list)
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!employee || !customer.trim() || !dueDate) return
    setError(null)
    setSaving(true)
    const { error } = await supabase.from('followups').insert({
      employee_id: employee.id,
      created_by: employee.id,
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

  async function passOn(f: Followup, toId: string) {
    setError(null)
    const { error } = await supabase.rpc('pass_followup', { p_followup_id: f.id, p_to: toId })
    if (error) {
      setError(error.message)
      return
    }
    await load()
  }

  if (items === null) return <PageSkeleton />

  const pending = sortByUrgency(items.filter((f) => f.status === 'pending'))
  const done = items.filter((f) => f.status === 'done').slice(-10).reverse()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Follow-ups</h1>
        <p className="mt-1 text-sm text-ink-soft">Customer orders, conversions and queries — nothing gets forgotten.</p>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {pushSupported() && !pushOn && (
        <button
          disabled={pushBusy}
          onClick={async () => {
            if (!employee) return
            setPushBusy(true)
            const result = await enablePush(employee.id)
            setPushBusy(false)
            if (result.ok) {
              setPushOn(true)
            } else {
              setError(result.reason ?? 'Could not enable notifications.')
            }
          }}
          className="w-full rounded-xl border border-gold-400 bg-gold-tint px-4 py-3 text-sm font-medium text-gold-600 disabled:opacity-50"
        >
          {pushBusy ? 'Setting up…' : 'Enable notifications on this device — new assignments and due reminders, even when the app is closed'}
        </button>
      )}
      {pushOn && <p className="text-xs text-sage-500">✓ Notifications are on for this device.</p>}

      <Card>
        <SectionLabel>New follow-up</SectionLabel>
        <form onSubmit={add} className="space-y-2.5">
          <div className="flex gap-2">
            <Select value={type} onChange={(e) => setType(e.target.value as FollowupType)}>
              <option value="query">Query follow-up</option>
              <option value="order">Order follow-up</option>
              <option value="conversion">Conversion follow-up</option>
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as FollowupPriority)}>
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </Select>
          </div>
          <Input placeholder="Customer name" required value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <Input placeholder="Contact (phone / Instagram handle) — optional" value={contact} onChange={(e) => setContact(e.target.value)} />
          <Textarea
            rows={2}
            placeholder="What's it about? e.g. Asked about 2ct solitaire ring on Instagram"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
          <div>
            <p className="label-caps mb-1">Follow up by</p>
            <Input type="date" required min={todayISO()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <Button type="submit" busy={saving} className="w-full">Add follow-up</Button>
        </form>
      </Card>

      <Card>
        <SectionLabel>To follow up ({pending.length})</SectionLabel>
        {pending.length === 0 && <EmptyState>All caught up ✦</EmptyState>}
        <ul className="space-y-2.5">
          {pending.map((f) => (
            <FollowupItem key={f.id} followup={f} onDone={markDone} busy={busyId === f.id} passTo={teammates} onPass={passOn} />
          ))}
        </ul>
      </Card>

      {done.length > 0 && (
        <Card>
          <SectionLabel>Recently completed</SectionLabel>
          <ul className="space-y-2.5">
            {done.map((f) => (
              <FollowupItem key={f.id} followup={f} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
