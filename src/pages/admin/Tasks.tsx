import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { todayISO, currentWeekStartISO } from '../../lib/dates'
import { Card, SectionLabel, Button, Banner, Input, Select, Chip, EmptyState, PageSkeleton } from '../../components/ui'
import type { Employee, StoreConfig, Todo, WeeklyGoal } from '../../types/database'

export default function AdminTasks() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [goals, setGoals] = useState<WeeklyGoal[]>([])
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newTaskEmp, setNewTaskEmp] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({})
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: emps }, { data: t }, { data: g }, { data: cfg }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('todos').select('*').eq('date', todayISO()).order('created_at'),
      supabase.from('weekly_goals').select('*').eq('week_start', currentWeekStartISO()).order('created_at'),
      supabase.from('store_config').select('*').limit(1).maybeSingle(),
    ])
    setEmployees(emps ?? [])
    setTodos(t ?? [])
    setGoals(g ?? [])
    setConfig(cfg ?? null)
    setLoading(false)
    if (emps && emps.length > 0) setNewTaskEmp((cur) => cur || emps[0].id)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addTask(e: FormEvent) {
    e.preventDefault()
    if (!newTaskEmp || !newTaskTitle.trim()) return
    setError(null)
    setAdding(true)
    const { error } = await supabase
      .from('todos')
      .insert({ employee_id: newTaskEmp, date: todayISO(), title: newTaskTitle.trim() })
    setAdding(false)
    if (error) {
      setError('Could not add task: ' + error.message)
      return
    }
    setNewTaskTitle('')
    await load()
  }

  async function saveComment(todo: Todo) {
    setError(null)
    const comment = (commentDraft[todo.id] ?? todo.admin_comment ?? '').trim()
    const { error } = await supabase.from('todos').update({ admin_comment: comment || null }).eq('id', todo.id)
    if (error) {
      setError('Could not save comment: ' + error.message)
      return
    }
    setSavedId(todo.id)
    setTimeout(() => setSavedId(null), 2000)
    await load()
  }

  const commentsOn = config?.task_comments_enabled ?? false

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Tasks & Goals</h1>
      {error && <Banner tone="error">{error}</Banner>}

      <Card>
        <SectionLabel>Assign a task</SectionLabel>
        <form onSubmit={addTask} className="space-y-2">
          <Select value={newTaskEmp} onChange={(e) => setNewTaskEmp(e.target.value)}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Input placeholder="Task title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="!py-2" />
            <Button type="submit" busy={adding} className="!py-2 text-xs">Add</Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-ink-soft">Adds straight to the employee's list — nothing else to do.</p>
      </Card>

      <Card>
        <SectionLabel>Today's tasks</SectionLabel>
        {employees.map((emp) => {
          const empTodos = todos.filter((t) => t.employee_id === emp.id)
          const done = empTodos.filter((t) => t.status === 'done').length
          return (
            <div key={emp.id} className="mb-4 border-b border-hairline pb-4 last:mb-0 last:border-0 last:pb-0 dark:border-hairline-dark">
              <p className="mb-2 flex items-center justify-between text-sm font-medium text-ink dark:text-ivory-dark-text">
                {emp.name}
                <span className="text-xs font-normal text-ink-soft">{done}/{empTodos.length} done</span>
              </p>
              {empTodos.length === 0 && <p className="text-xs text-ink-soft">No tasks today.</p>}
              <ul className="space-y-2">
                {empTodos.map((t) => (
                  <li key={t.id} className={commentsOn ? 'rounded-xl border border-hairline p-2.5 dark:border-hairline-dark' : ''}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm ${t.status === 'done' ? 'text-ink-soft line-through' : 'text-ink dark:text-ivory-dark-text'}`}>
                        {t.title}
                      </span>
                      <Chip tone={t.status === 'done' ? 'sage' : 'neutral'}>{t.status === 'done' ? 'Done' : 'Open'}</Chip>
                    </div>
                    {commentsOn && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Input
                          placeholder="Comment for the employee"
                          value={commentDraft[t.id] ?? t.admin_comment ?? ''}
                          onChange={(e) => setCommentDraft((c) => ({ ...c, [t.id]: e.target.value }))}
                          className="!px-2.5 !py-1 text-xs"
                        />
                        <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={() => saveComment(t)}>
                          {savedId === t.id ? 'Saved ✓' : 'Save'}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {employees.length === 0 && <EmptyState>No employees yet.</EmptyState>}
        {!commentsOn && (
          <p className="mt-3 border-t border-hairline pt-3 text-xs text-ink-soft dark:border-hairline-dark">
            Task comments are off — employees just tick tasks off. Turn comments on in Team settings if you want to
            leave notes on individual tasks.
          </p>
        )}
      </Card>

      <Card>
        <SectionLabel>This week's goals</SectionLabel>
        <ul className="space-y-2">
          {employees.map((emp) => {
            const empGoals = goals.filter((g) => g.employee_id === emp.id)
            const done = empGoals.filter((g) => g.is_completed).length
            return (
              <li key={emp.id} className="flex items-center justify-between text-sm">
                <span className="text-ink dark:text-ivory-dark-text">{emp.name}</span>
                <span className="text-xs text-ink-soft">{done}/{empGoals.length} completed</span>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
