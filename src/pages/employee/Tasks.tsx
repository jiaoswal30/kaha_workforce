import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { todayISO, currentWeekStartISO } from '../../lib/dates'
import { Card, Button, EmptyState } from '../../components/ui'
import type { Todo, WeeklyGoal, TodoStatus } from '../../types/database'

const STATUS_CYCLE: Record<TodoStatus, TodoStatus> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
}

const STATUS_LABEL: Record<TodoStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
}

export default function EmployeeTasks() {
  const { employee } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [goals, setGoals] = useState<WeeklyGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [goalTitle, setGoalTitle] = useState('')

  const load = useCallback(async () => {
    if (!employee) return
    await supabase.rpc('carry_over_my_todos')
    const [{ data: t }, { data: g }] = await Promise.all([
      supabase.from('todos').select('*').eq('employee_id', employee.id).eq('date', todayISO()).order('created_at'),
      supabase.from('weekly_goals').select('*').eq('employee_id', employee.id).eq('week_start', currentWeekStartISO()).order('created_at'),
    ])
    setTodos(t ?? [])
    setGoals(g ?? [])
    setLoading(false)
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  async function addTodo(e: FormEvent) {
    e.preventDefault()
    if (!employee || !title.trim()) return
    await supabase.from('todos').insert({ employee_id: employee.id, date: todayISO(), title: title.trim(), description: description.trim() || null })
    setTitle('')
    setDescription('')
    await load()
  }

  async function cycleStatus(todo: Todo) {
    const next = STATUS_CYCLE[todo.status]
    await supabase
      .from('todos')
      .update({ status: next, completed_at: next === 'done' ? new Date().toISOString() : null })
      .eq('id', todo.id)
    await load()
  }

  async function addGoal(e: FormEvent) {
    e.preventDefault()
    if (!employee || !goalTitle.trim() || goals.length >= 5) return
    await supabase.from('weekly_goals').insert({ employee_id: employee.id, week_start: currentWeekStartISO(), title: goalTitle.trim() })
    setGoalTitle('')
    await load()
  }

  async function toggleGoal(goal: WeeklyGoal) {
    await supabase.from('weekly_goals').update({ is_completed: !goal.is_completed }).eq('id', goal.id)
    await load()
  }

  const completedGoals = goals.filter((g) => g.is_completed).length

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Tasks</h1>

      <Card>
        <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Today's to-dos</p>
        <form onSubmit={addTodo} className="mb-3 space-y-2">
          <input
            placeholder="New task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900"
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900"
          />
          <Button type="submit" className="w-full py-2 text-sm">Add task</Button>
        </form>
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {todos.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`text-sm font-medium ${t.status === 'done' ? 'text-stone-400 line-through' : 'text-stone-900 dark:text-stone-50'}`}>
                    {t.title}
                    {t.carried_from && <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-normal text-stone-600 dark:bg-stone-700 dark:text-stone-300">carried over</span>}
                  </p>
                  {t.description && <p className="text-xs text-stone-500">{t.description}</p>}
                  {t.admin_comment && <p className="mt-1 text-xs text-accent-600">Admin: {t.admin_comment}</p>}
                </div>
                <button
                  onClick={() => cycleStatus(t)}
                  className="whitespace-nowrap rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 dark:bg-stone-700 dark:text-stone-200"
                >
                  {STATUS_LABEL[t.status]}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {todos.length === 0 && <EmptyState>No tasks yet today.</EmptyState>}
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">Weekly goals</p>
          <span className="text-xs text-stone-500">{completedGoals}/{goals.length || 5} completed</span>
        </div>
        {goals.length < 5 && (
          <form onSubmit={addGoal} className="mb-3 flex gap-2">
            <input
              placeholder="New weekly goal"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900"
            />
            <Button type="submit" className="px-3 py-2 text-sm">Add</Button>
          </form>
        )}
        <ul className="space-y-1.5">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={g.is_completed} onChange={() => toggleGoal(g)} className="h-4 w-4 accent-accent-600" />
              <span className={g.is_completed ? 'text-stone-400 line-through' : 'text-stone-900 dark:text-stone-50'}>{g.title}</span>
            </li>
          ))}
        </ul>
        {goals.length === 0 && <EmptyState>No goals set for this week yet.</EmptyState>}
      </Card>
    </div>
  )
}
