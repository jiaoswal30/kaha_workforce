import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { addDays, format } from 'date-fns'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { todayISO, currentWeekStartISO, formatDate } from '../../lib/dates'
import { sortByUrgency, isOverdue, FOLLOWUP_TYPE_LABELS } from '../../lib/followups'
import { Card, SectionLabel, Button, Input, Chip, EmptyState, PageSkeleton, ProgressRing } from '../../components/ui'
import type { Followup, Todo, WeeklyGoal } from '../../types/database'

export default function EmployeeTasks() {
  const { employee } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [goals, setGoals] = useState<WeeklyGoal[]>([])
  const [followups, setFollowups] = useState<Followup[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [goalTitle, setGoalTitle] = useState('')

  const load = useCallback(async () => {
    if (!employee) return
    await supabase.rpc('carry_over_my_todos')
    const weekEnd = format(addDays(new Date(currentWeekStartISO() + 'T00:00:00'), 6), 'yyyy-MM-dd')
    const [{ data: t }, { data: g }, { data: f }] = await Promise.all([
      supabase.from('todos').select('*').eq('employee_id', employee.id).eq('date', todayISO()).order('created_at'),
      supabase.from('weekly_goals').select('*').eq('employee_id', employee.id).eq('week_start', currentWeekStartISO()).order('created_at'),
      supabase
        .from('followups')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('status', 'pending')
        .lte('due_date', weekEnd),
    ])
    setTodos(t ?? [])
    setGoals(g ?? [])
    setFollowups(sortByUrgency(f ?? []))
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

  async function toggleTodo(todo: Todo) {
    const done = todo.status !== 'done'
    await supabase
      .from('todos')
      .update({ status: done ? 'done' : 'pending', completed_at: done ? new Date().toISOString() : null })
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

  async function completeFollowup(f: Followup) {
    await supabase
      .from('followups')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', f.id)
    await load()
  }

  const completedGoals = goals.filter((g) => g.is_completed).length
  const dueNowFollowups = followups.filter((f) => f.due_date <= todayISO())
  const laterThisWeek = followups.filter((f) => f.due_date > todayISO())

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Tasks</h1>

      <Card>
        <SectionLabel>Today's to-dos</SectionLabel>

        {dueNowFollowups.length > 0 && (
          <ul className="mb-3 space-y-2.5 border-b border-hairline pb-3 dark:border-hairline-dark">
            {dueNowFollowups.map((f) => (
              <li key={f.id} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => completeFollowup(f)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500"
                />
                <div className="min-w-0">
                  <p className="text-sm text-ink dark:text-ivory-dark-text">
                    Follow up: {f.customer_name}
                    <span className="ml-2 inline-block align-middle"><Chip tone="gold">{FOLLOWUP_TYPE_LABELS[f.type]}</Chip></span>
                  </p>
                  <p className={`text-xs ${isOverdue(f) ? 'font-medium text-brick-500' : 'text-bronze-500'}`}>
                    {isOverdue(f) ? `Overdue — was due ${formatDate(f.due_date)}` : 'Due today'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addTodo} className="mb-4 space-y-2">
          <Input placeholder="New task" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button type="submit" className="w-full !py-2 text-xs">Add task</Button>
        </form>
        <ul className="space-y-2.5">
          {todos.map((t) => (
            <li key={t.id} className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={t.status === 'done'}
                onChange={() => toggleTodo(t)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-gold-500"
              />
              <div className="min-w-0">
                <p className={`text-sm ${t.status === 'done' ? 'text-ink-soft line-through' : 'text-ink dark:text-ivory-dark-text'}`}>
                  {t.title}
                  {t.carried_from && <span className="ml-2 inline-block align-middle"><Chip tone="neutral">carried</Chip></span>}
                </p>
                {t.description && <p className="mt-0.5 text-xs text-ink-soft">{t.description}</p>}
                {t.admin_comment && <p className="mt-0.5 text-xs italic text-gold-600">Admin: {t.admin_comment}</p>}
              </div>
            </li>
          ))}
        </ul>
        {todos.length === 0 && dueNowFollowups.length === 0 && <EmptyState>No tasks yet today.</EmptyState>}

        {laterThisWeek.length > 0 && (
          <div className="mt-3 border-t border-hairline pt-3 dark:border-hairline-dark">
            <p className="label-caps mb-2">Follow-ups later this week</p>
            <ul className="space-y-1">
              {laterThisWeek.map((f) => (
                <li key={f.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-ink dark:text-ivory-dark-text">
                    {f.customer_name} · {FOLLOWUP_TYPE_LABELS[f.type]}
                  </span>
                  <span className="shrink-0 text-ink-soft">{formatDate(f.due_date)}</span>
                </li>
              ))}
            </ul>
            <Link to="/followups" className="mt-2 block text-xs font-medium text-gold-600">All follow-ups →</Link>
          </div>
        )}
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
