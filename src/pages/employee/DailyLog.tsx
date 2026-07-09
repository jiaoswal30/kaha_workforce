import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { todayISO, formatDate } from '../../lib/dates'
import { Card, SectionLabel, Button, Banner, Input, Textarea, FieldLabel, PageSkeleton } from '../../components/ui'
import type { DailyLog } from '../../types/database'

export default function EmployeeDailyLog() {
  const { employee } = useAuth()
  const [existing, setExisting] = useState<DailyLog | null>(null)
  const [recent, setRecent] = useState<DailyLog[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [customers, setCustomers] = useState('')
  const [activities, setActivities] = useState('')
  const [sales, setSales] = useState('')
  const [issues, setIssues] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!employee) return
    const [{ data }, { data: prev }] = await Promise.all([
      supabase.from('daily_logs').select('*').eq('employee_id', employee.id).eq('date', todayISO()).maybeSingle(),
      supabase
        .from('daily_logs')
        .select('*')
        .eq('employee_id', employee.id)
        .lt('date', todayISO())
        .order('date', { ascending: false })
        .limit(7),
    ])
    if (data) {
      setExisting(data)
      setCustomers(String(data.customers_handled ?? ''))
      setActivities(data.key_activities ?? '')
      setSales(data.sales_notes ?? '')
      setIssues(data.issues ?? '')
    }
    setRecent(prev ?? [])
    setLoading(false)
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!employee) return
    setSaved(false)
    setSaving(true)
    await supabase.from('daily_logs').upsert(
      {
        employee_id: employee.id,
        date: todayISO(),
        customers_handled: customers ? Number(customers) : null,
        key_activities: activities || null,
        sales_notes: sales || null,
        issues: issues || null,
      },
      { onConflict: 'employee_id,date' }
    )
    setSaving(false)
    setSaved(true)
    await load()
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Daily Log</h1>
      {saved && <Banner tone="success">Saved.</Banner>}

      <Card>
        <SectionLabel>{format(new Date(), 'EEEE, d MMMM')}</SectionLabel>
        {existing && (
          <p className="mb-3 text-xs text-ink-soft">
            Logged at {format(new Date(existing.created_at), 'h:mm a')} — you can update it.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel>Customers handled today</FieldLabel>
            <Input type="number" min={0} value={customers} onChange={(e) => setCustomers(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Key activities</FieldLabel>
            <Textarea
              rows={3}
              placeholder="Reorganized the solitaire display…"
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Sales notes (optional)</FieldLabel>
            <Textarea rows={2} placeholder="Any notable sale or upsell worth flagging" value={sales} onChange={(e) => setSales(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Issues / blockers</FieldLabel>
            <Textarea
              rows={2}
              placeholder="Anything that needs admin attention"
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              className="!border-bronze-500/30"
            />
          </div>
          <Button type="submit" busy={saving} className="w-full">
            {existing ? 'Update log' : 'Save log'}
          </Button>
        </form>
      </Card>

      {recent.length > 0 && (
        <Card>
          <SectionLabel>Last 7 logs</SectionLabel>
          <ul className="divide-y divide-hairline dark:divide-hairline-dark">
            {recent.map((log) => (
              <li key={log.id}>
                <button
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{formatDate(log.date)}</p>
                    {expanded !== log.id && log.key_activities && (
                      <p className="truncate text-xs text-ink-soft">{log.key_activities}</p>
                    )}
                  </div>
                  {expanded === log.id ? (
                    <ChevronUp size={15} strokeWidth={1.5} className="shrink-0 text-ink-soft" />
                  ) : (
                    <ChevronDown size={15} strokeWidth={1.5} className="shrink-0 text-ink-soft" />
                  )}
                </button>
                {expanded === log.id && (
                  <div className="space-y-1.5 pb-3 text-xs">
                    {log.customers_handled !== null && (
                      <p className="text-ink dark:text-ivory-dark-text">Customers: {log.customers_handled}</p>
                    )}
                    {log.key_activities && <p className="text-ink dark:text-ivory-dark-text">{log.key_activities}</p>}
                    {log.sales_notes && <p className="text-sage-500">Sales: {log.sales_notes}</p>}
                    {log.issues && <p className="text-bronze-500">Issue: {log.issues}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
