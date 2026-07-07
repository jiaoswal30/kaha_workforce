import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, EmptyState } from '../../components/ui'
import type { Employee, InventoryNote } from '../../types/database'

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotesPage() {
  const { employee } = useAuth()
  const [notes, setNotes] = useState<InventoryNote[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: n }, { data: e }] = await Promise.all([
      supabase.from('inventory_notes').select('*').order('is_resolved').order('created_at', { ascending: false }),
      supabase.from('employees').select('*'),
    ])
    setNotes(n ?? [])
    setEmployees(e ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addNote(e: FormEvent) {
    e.preventDefault()
    if (!employee || !text.trim()) return
    await supabase.from('inventory_notes').insert({ employee_id: employee.id, note: text.trim() })
    setText('')
    await load()
  }

  async function resolve(note: InventoryNote) {
    await supabase.from('inventory_notes').update({ is_resolved: !note.is_resolved }).eq('id', note.id)
    await load()
  }

  function authorName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? 'Someone'
  }

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Inventory Notes</h1>

      <Card>
        <form onSubmit={addNote} className="flex gap-2">
          <input
            placeholder="e.g. Running low on silver cleaning solution"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900"
          />
          <Button type="submit" className="px-3 py-2 text-sm">Post</Button>
        </form>
      </Card>

      <div className="space-y-2">
        {notes.map((n) => (
          <Card key={n.id} className={n.is_resolved ? 'opacity-60' : ''}>
            <p className="text-sm text-stone-900 dark:text-stone-50">{n.note}</p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-stone-500">{authorName(n.employee_id)} · {timeAgo(n.created_at)}</p>
              {employee?.role === 'admin' && (
                <button onClick={() => resolve(n)} className="text-xs font-medium text-accent-600">
                  {n.is_resolved ? 'Reopen' : 'Mark resolved'}
                </button>
              )}
              {n.is_resolved && employee?.role !== 'admin' && <span className="text-xs text-green-600">Resolved</span>}
            </div>
          </Card>
        ))}
        {notes.length === 0 && (
          <Card>
            <EmptyState>No notes yet.</EmptyState>
          </Card>
        )}
      </div>
    </div>
  )
}
