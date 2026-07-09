import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, SectionLabel, Button, Input, Chip, EmptyState, PageSkeleton } from '../../components/ui'
import type { Employee, InventoryNote } from '../../types/database'

export default function NotesPage() {
  const { employee } = useAuth()
  const [notes, setNotes] = useState<InventoryNote[] | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    const [{ data: n }, { data: e }] = await Promise.all([
      supabase.from('inventory_notes').select('*').order('is_resolved').order('created_at', { ascending: false }),
      supabase.from('employees').select('*'),
    ])
    setNotes(n ?? [])
    setEmployees(e ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addNote(e: FormEvent) {
    e.preventDefault()
    if (!employee || !text.trim()) return
    setPosting(true)
    await supabase.from('inventory_notes').insert({ employee_id: employee.id, note: text.trim() })
    setText('')
    setPosting(false)
    await load()
  }

  async function resolve(note: InventoryNote) {
    await supabase.from('inventory_notes').update({ is_resolved: !note.is_resolved }).eq('id', note.id)
    await load()
  }

  function authorName(id: string) {
    return employees.find((e) => e.id === id)?.name ?? 'Someone'
  }

  if (notes === null) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Inventory Notes</h1>

      <Card>
        <form onSubmit={addNote} className="flex gap-2">
          <Input
            placeholder="Running low on silver cleaning solution…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="!py-2"
          />
          <Button type="submit" busy={posting} className="!py-2 text-xs">Post</Button>
        </form>
      </Card>

      <Card>
        <SectionLabel>Notes</SectionLabel>
        {notes.length === 0 && <EmptyState>No notes yet.</EmptyState>}
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {notes.map((n) => (
            <li key={n.id} className={`py-3 ${n.is_resolved ? 'opacity-55' : ''}`}>
              <p className="text-sm text-ink dark:text-ivory-dark-text">{n.note}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-xs text-ink-soft">
                  {authorName(n.employee_id)} · {formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}
                </p>
                {employee?.role === 'admin' ? (
                  <button onClick={() => resolve(n)} className="text-xs font-medium text-gold-600">
                    {n.is_resolved ? 'Reopen' : 'Mark resolved'}
                  </button>
                ) : (
                  n.is_resolved && <Chip tone="sage">Resolved</Chip>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
