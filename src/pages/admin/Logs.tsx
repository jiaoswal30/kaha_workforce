import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { formatDate } from '../../lib/dates'
import { Card, EmptyState } from '../../components/ui'
import type { DailyLog, Employee } from '../../types/database'

export default function AdminLogs() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')

  const load = useCallback(async () => {
    const [{ data: emps }, { data: l }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('daily_logs').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
    ])
    setEmployees(emps ?? [])
    setLogs(l ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? 'Unknown'
  }

  const filtered = logs.filter((l) => {
    if (employeeFilter !== 'all' && l.employee_id !== employeeFilter) return false
    if (dateFilter && l.date !== dateFilter) return false
    return true
  })

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Daily Logs</h1>

      <Card>
        <div className="flex gap-2">
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
          >
            <option value="all">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
          />
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.map((log) => (
          <Card key={log.id}>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium text-stone-900 dark:text-stone-50">{employeeName(log.employee_id)}</p>
              <p className="text-xs text-stone-500">{formatDate(log.date)}</p>
            </div>
            {log.customers_handled !== null && (
              <p className="text-sm text-stone-600 dark:text-stone-300">Customers handled: {log.customers_handled}</p>
            )}
            {log.key_activities && <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{log.key_activities}</p>}
            {log.sales_notes && <p className="mt-1 text-sm text-green-700 dark:text-green-400">Sales: {log.sales_notes}</p>}
            {log.issues && <p className="mt-1 text-sm text-red-700 dark:text-red-400">Issue: {log.issues}</p>}
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card>
            <EmptyState>No logs match this filter.</EmptyState>
          </Card>
        )}
      </div>
    </div>
  )
}
