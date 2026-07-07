import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { todayISO, currentWeekStartISO } from '../../lib/dates'
import { Card, Button, EmptyState } from '../../components/ui'
import type { Employee, Todo, WeeklyGoal } from '../../types/database'

export default function AdminTasks() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [goals, setGoals] = useState<WeeklyGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [newTaskEmp, setNewTaskEmp] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [{ data: emps }, { data: t }, { data: g }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('todos').select('*').eq('date', todayISO()).order('created_at'),
      supabase.from('weekly_goals').select('*').eq('week_start', currentWeekStartISO()).order('created_at'),
    ])
    setEmployees(emps ?? [])
    setTodos(t ?? [])
    setGoals(g ?? [])
    setLoading(false)
    if (emps && emps.length > 0) setNewTaskEmp((cur) => cur || emps[0].id)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addTask(e: FormEvent) {
    e.preventDefault()
    if (!newTaskEmp || !newTaskTitle.trim()) return
    await supabase.from('todos').insert({ employee_id: newTaskEmp, date: todayISO(), title: newTaskTitle.trim() })
    setNewTaskTitle('')
    await load()
  }

  async function saveComment(todo: Todo) {
    const comment = commentDraft[todo.id] ?? todo.admin_comment ?? ''
    await supabase.from('todos').update({ admin_comment: comment }).eq('id', todo.id)
    await load()
  }

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Employee Performance</h1>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Assign a task</p>
        <form onSubmit={addTask} className="flex flex-col gap-2 sm:flex-row">
          <select
            value={newTaskEmp}
            onChange={(e) => setNewTaskEmp(e.target.value)}
            className="rounded-xl border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <input
            placeholder="Task title"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900"
          />
          <Button type="submit" className="px-3 py-2 text-sm">Add</Button>
        </form>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Today's tasks — all employees</p>
        {employees.map((emp) => {
          const empTodos = todos.filter((t) => t.employee_id === emp.id)
          const done = empTodos.filter((t) => t.status === 'done').length
          return (
            <div key={emp.id} className="mb-3 border-b border-stone-100 pb-3 last:border-0 dark:border-stone-800">
              <p className="mb-1 text-sm font-medium text-stone-900 dark:text-stone-50">
                {emp.name} <span className="text-xs font-normal text-stone-500">({done}/{empTodos.length || 0} done)</span>
              </p>
              {empTodos.length === 0 && <p className="text-xs text-stone-500">No tasks today.</p>}
              <ul className="space-y-1.5">
                {empTodos.map((t) => (
                  <li key={t.id} className="rounded-lg bg-stone-50 p-2 text-sm dark:bg-stone-900">
                    <div className="flex items-center justify-between">
                      <span className={t.status === 'done' ? 'text-stone-400 line-through' : ''}>{t.title}</span>
                      <span className="text-xs text-stone-500">{t.status}</span>
                    </div>
                    <div className="mt-1 flex gap-2">
                      <input
                        placeholder="Comment"
                        defaultValue={t.admin_comment ?? ''}
                        onChange={(e) => setCommentDraft((c) => ({ ...c, [t.id]: e.target.value }))}
                        className="flex-1 rounded-lg border border-stone-300 px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-800"
                      />
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => saveComment(t)}>Save</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {employees.length === 0 && <EmptyState>No employees yet.</EmptyState>}
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">This week's goals</p>
        {employees.map((emp) => {
          const empGoals = goals.filter((g) => g.employee_id === emp.id)
          const done = empGoals.filter((g) => g.is_completed).length
          return (
            <div key={emp.id} className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-stone-900 dark:text-stone-50">{emp.name}</span>
              <span className="text-stone-500">{done}/{empGoals.length} completed</span>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
