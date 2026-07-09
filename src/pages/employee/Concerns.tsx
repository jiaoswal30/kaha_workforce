import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, SectionLabel, Button, Banner, Input, Select, Textarea, PageSkeleton, EmptyState } from '../../components/ui'
import { ComplaintThread, StatusChip, CATEGORY_LABELS } from '../../components/ComplaintThread'
import type { Complaint, ComplaintCategory } from '../../types/database'

export default function Concerns() {
  const { employee } = useAuth()
  const [complaints, setComplaints] = useState<Complaint[] | null>(null)
  const [open, setOpen] = useState<Complaint | null>(null)
  const [category, setCategory] = useState<ComplaintCategory>('workplace')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!employee) return
    const { data } = await supabase
      .from('complaints')
      .select('*')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
    setComplaints(data ?? [])
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!employee || !subject.trim() || !body.trim()) return
    setSending(true)
    const { data, error } = await supabase
      .from('complaints')
      .insert({ employee_id: employee.id, category, subject: subject.trim() })
      .select()
      .single()
    if (!error && data) {
      await supabase.from('complaint_messages').insert({
        complaint_id: data.id,
        sender_id: employee.id,
        body: body.trim(),
      })
    }
    setSending(false)
    setSubject('')
    setBody('')
    setNotice('Sent to admin — only the two of you can see this.')
    await load()
  }

  if (complaints === null) return <PageSkeleton />

  if (open) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setOpen(null); load() }}
          className="flex items-center gap-1 text-sm text-ink-soft hover:text-ink dark:hover:text-ivory-dark-text"
        >
          <ChevronLeft size={16} strokeWidth={1.5} /> All concerns
        </button>
        <Card>
          <div className="mb-3 flex items-start justify-between gap-2 border-b border-hairline pb-3 dark:border-hairline-dark">
            <div>
              <p className="font-medium text-ink dark:text-ivory-dark-text">{open.subject}</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {CATEGORY_LABELS[open.category]} · {format(new Date(open.created_at), 'd MMM yyyy')}
              </p>
            </div>
            <StatusChip status={open.status} />
          </div>
          <ComplaintThread complaint={open} onChanged={load} />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Concerns</h1>
        <p className="mt-1 text-sm text-ink-soft">Raise anything — only you and the admin can see it.</p>
      </div>

      {notice && <Banner tone="success">{notice}</Banner>}

      <Card>
        <SectionLabel>Raise a concern</SectionLabel>
        <form onSubmit={submit} className="space-y-3">
          <Select value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Input placeholder="Subject — one line" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          <Textarea rows={3} placeholder="What happened? Details help." value={body} onChange={(e) => setBody(e.target.value)} required />
          <Button type="submit" busy={sending} className="w-full">Send to admin</Button>
        </form>
      </Card>

      <Card>
        <SectionLabel>My concerns</SectionLabel>
        {complaints.length === 0 && <EmptyState>Nothing raised yet.</EmptyState>}
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {complaints.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOpen(c)} className="flex w-full items-center justify-between gap-2 py-3 text-left">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink dark:text-ivory-dark-text">{c.subject}</p>
                  <p className="text-xs text-ink-soft">
                    {CATEGORY_LABELS[c.category]} · {format(new Date(c.created_at), 'd MMM')}
                  </p>
                </div>
                <StatusChip status={c.status} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
