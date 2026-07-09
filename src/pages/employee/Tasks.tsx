import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { todayISO, currentWeekStartISO } from '../../lib/dates'
import { Card, SectionLabel, Button, Input, Chip, EmptyState, PageSkeleton, ProgressRing } from '../../components/ui'
import type { Todo, WeeklyGoal, TodoStatus } from '../../types/database'

const STATUS_CYCLE: Record<TodoStatus, TodoStatus> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
}

const STATUS_META: Record<TodoStatus, { label: string; tone: 'neutral' | 'gold' | 'sage' }> = {
  pending: { label: 'Pending', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'gold' },
  done: { label: 'Done', tone: 'sage' },
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
    await supabase.from('todos').insert({
      employee_id: employee.id,
      date: todayISO(),
      title: title.trim(),
      description: description.trim() || null,
    })
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
    await supabase.from('weekly_goals').insert({
      employee_id: employee.id,
      week_start: currentWeekStartISO(),
      title: goalTitle.trim(),
    })
    setGoalTitle('')
    await load()
  }

  async function toggleGoal(goal: WeeklyGoal) {
    await supabase.from('weekly_goals').update({ is_completed: !goal.is_completed }).eq('id', goal.id)
    await load()
  }

  const completedGoals = goals.filter((g) => g.is_completed).length

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Tasks</h1>

      <Card>
        <SectionLabel>Today's to-dos</SectionLabel>
        <form onSubmit={addTodo} className="mb-4 space-y-2">
          <Input placeholder="New task" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button type="submit" className="w-full !py-2 text-xs">Add task</Button>
        </form>
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {todos.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${t.status === 'done' ? 'text-ink-soft line-through' : 'text-ink dark:text-ivory-dark-text'}`}>
                    {t.title}
                  </p>
                  {t.carried_from && <Chip tone="neutral">carried over</Chip>}
                  {t.description && <p className="mt-0.5 text-xs text-ink-soft">{t.description}</p>}
                  {t.admin_comment && <p className="mt-1 text-xs italic text-gold-600">Admin: {t.admin_comment}</p>}
                </div>
                <button onClick={() => cycleStatus(t)} className="shrink-0">
                  <Chip tone={STATUS_META[t.status].tone}>{STATUS_META[t.status].label}</Chip>
                </button>
              </div>
            </li>
          ))}
        </ul>
        {todos.length === 0 && <EmptyState>No tasks yet today.</EmptyState>}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <SectionLabel>Weekly goals</SectionLabel>
            <p className="-mt-1 text-xs text-ink-soft">Week of {format(new Date(currentWeekStartISO() + 'T00:00:00'), 'd MMMM')}</p>
          </div>
          <div className="relative">
            <ProgressRing value={completedGoals} total={Math.max(goals.length, 1)} />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-ink dark:text-ivory-dark-text">
              {completedGoals}/{goals.length}
            </span>
          </div>
        </div>
        {goals.length < 5 ? (
          <form onSubmit={addGoal} className="mb-3 flex gap-2">
            <Input placeholder="New weekly goal" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} className="!py-2" />
            <Button type="submit" className="!py-2 text-xs">Add</Button>
          </form>
        ) : (
          <p className="mb-3 text-xs text-ink-soft">Max 5 goals per week.</p>
        )}
        <ul className="space-y-2">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center gap-2.5">
              <input type="checkbox" checked={g.is_completed} onChange={() => toggleGoal(g)} className="h-4 w-4 accent-gold-500" />
              <span className={`text-sm ${g.is_completed ? 'text-ink-soft line-through' : 'text-ink dark:text-ivory-dark-text'}`}>
                {g.title}
              </span>
            </li>
          ))}
        </ul>
        {goals.length === 0 && <EmptyState>No goals set for this week yet.</EmptyState>}
      </Card>
    </div>
  )
}
