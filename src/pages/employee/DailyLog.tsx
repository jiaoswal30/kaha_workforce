import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { todayISO } from '../../lib/dates'
import { Card, Button, Banner } from '../../components/ui'
import type { DailyLog } from '../../types/database'

export default function EmployeeDailyLog() {
  const { employee } = useAuth()
  const [existing, setExisting] = useState<DailyLog | null>(null)
  const [customers, setCustomers] = useState('')
  const [activities, setActivities] = useState('')
  const [sales, setSales] = useState('')
  const [issues, setIssues] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!employee) return
    const { data } = await supabase.from('daily_logs').select('*').eq('employee_id', employee.id).eq('date', todayISO()).maybeSingle()
    if (data) {
      setExisting(data)
      setCustomers(String(data.customers_handled ?? ''))
      setActivities(data.key_activities ?? '')
      setSales(data.sales_notes ?? '')
      setIssues(data.issues ?? '')
    }
    setLoading(false)
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!employee) return
    setSaved(false)
    const payload = {
      employee_id: employee.id,
      date: todayISO(),
      customers_handled: customers ? Number(customers) : null,
      key_activities: activities || null,
      sales_notes: sales || null,
      issues: issues || null,
    }
    await supabase.from('daily_logs').upsert(payload, { onConflict: 'employee_id,date' })
    setSaved(true)
    await load()
  }

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Daily Log</h1>
      {saved && <Banner tone="success">Saved.</Banner>}
      {existing && <p className="text-xs text-stone-500">You've already logged today — saving again will update it.</p>}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Customers handled today</label>
            <input
              type="number"
              min={0}
              value={customers}
              onChange={(e) => setCustomers(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none dark:border-stone-700 dark:bg-stone-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Key activities</label>
            <textarea
              rows={3}
              placeholder="e.g. Reorganized the diamond ring display case"
              value={activities}
              onChange={(e) => setActivities(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none dark:border-stone-700 dark:bg-stone-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Sales notes (optional)</label>
            <textarea
              rows={2}
              placeholder="Any notable sale or upsell worth flagging"
              value={sales}
              onChange={(e) => setSales(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none dark:border-stone-700 dark:bg-stone-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Issues / blockers</label>
            <textarea
              rows={2}
              placeholder="Anything that needs admin attention"
              value={issues}
              onChange={(e) => setIssues(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2.5 outline-none dark:border-stone-700 dark:bg-stone-900"
            />
          </div>
          <Button type="submit" className="w-full">{existing ? 'Update log' : 'Save log'}</Button>
        </form>
      </Card>
    </div>
  )
}
