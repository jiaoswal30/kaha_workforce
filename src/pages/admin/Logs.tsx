import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { formatDate } from '../../lib/dates'
import { Card, Input, Select, EmptyState, PageSkeleton } from '../../components/ui'
import type { DailyLog, Employee } from '../../types/database'

export default function AdminLogs() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [logs, setLogs] = useState<DailyLog[] | null>(null)
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')

  const load = useCallback(async () => {
    const [{ data: emps }, { data: l }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('daily_logs').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
    ])
    setEmployees(emps ?? [])
    setLogs(l ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? 'Unknown'
  }

  if (logs === null) return <PageSkeleton />

  const filtered = logs.filter((l) => {
    if (employeeFilter !== 'all' && l.employee_id !== employeeFilter) return false
    if (dateFilter && l.date !== dateFilter) return false
    return true
  })

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Daily Logs</h1>

      <Card>
        <div className="flex gap-2">
          <Select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="!py-2 text-xs">
            <option value="all">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="!py-2 text-xs" />
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.map((log) => (
          <Card key={log.id}>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{employeeName(log.employee_id)}</p>
              <p className="label-caps">{formatDate(log.date)}</p>
            </div>
            {log.customers_handled !== null && (
              <p className="text-sm text-ink-soft">Customers handled: {log.customers_handled}</p>
            )}
            {log.key_activities && <p className="mt-1 text-sm text-ink dark:text-ivory-dark-text">{log.key_activities}</p>}
            {log.sales_notes && <p className="mt-1 text-sm text-sage-500">Sales: {log.sales_notes}</p>}
            {log.issues && <p className="mt-1 text-sm text-bronze-500">Issue: {log.issues}</p>}
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
