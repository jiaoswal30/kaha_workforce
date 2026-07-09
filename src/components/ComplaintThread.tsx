import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabaseClient'
import { Button, Chip, Input } from './ui'
import { useAuth } from '../contexts/AuthContext'
import type { Complaint, ComplaintMessage, ComplaintStatus } from '../types/database'

export const CATEGORY_LABELS: Record<string, string> = {
  workplace: 'Workplace',
  schedule: 'Schedule',
  customer_incident: 'Customer incident',
  equipment: 'Equipment',
  other: 'Other',
}

export function StatusChip({ status }: { status: ComplaintStatus }) {
  if (status === 'open') return <Chip tone="neutral">Open</Chip>
  if (status === 'in_discussion') return <Chip tone="bronze">In discussion</Chip>
  return <Chip tone="sage">Resolved</Chip>
}

export function ComplaintThread({
  complaint,
  onChanged,
}: {
  complaint: Complaint
  onChanged: () => void
}) {
  const { employee } = useAuth()
  const [messages, setMessages] = useState<ComplaintMessage[] | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('complaint_messages')
      .select('*')
      .eq('complaint_id', complaint.id)
      .order('created_at')
    setMessages(data ?? [])
  }, [complaint.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!employee || !draft.trim()) return
    setSending(true)
    await supabase.from('complaint_messages').insert({
      complaint_id: complaint.id,
      sender_id: employee.id,
      body: draft.trim(),
    })
    setDraft('')
    setSending(false)
    await load()
    onChanged()
  }

  const readOnly = complaint.status === 'resolved'

  return (
    <div>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto pb-1">
        {messages === null && <div className="skeleton h-16 rounded-xl" />}
        {messages?.map((m) => {
          if (m.is_system) {
            return (
              <p key={m.id} className="py-1 text-center text-xs text-ink-soft">
                {m.body} · {format(new Date(m.created_at), 'd MMM')}
              </p>
            )
          }
          const mine = m.sender_id === employee?.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                  mine
                    ? 'rounded-br-md bg-ivory text-ink dark:bg-espresso dark:text-ivory-dark-text'
                    : 'rounded-bl-md border border-hairline bg-white text-ink dark:border-hairline-dark dark:bg-espresso-2 dark:text-ivory-dark-text'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-right text-[10px] text-ink-soft">{format(new Date(m.created_at), 'd MMM, h:mm a')}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {readOnly ? (
        <p className="mt-3 border-t border-hairline pt-3 text-center text-xs text-ink-soft dark:border-hairline-dark">
          This concern is resolved.
        </p>
      ) : (
        <form onSubmit={send} className="mt-3 flex gap-2 border-t border-hairline pt-3 dark:border-hairline-dark">
          <Input placeholder="Write a reply…" value={draft} onChange={(e) => setDraft(e.target.value)} className="!py-2" />
          <Button type="submit" busy={sending} className="!py-2 text-xs">
            Send
          </Button>
        </form>
      )}
    </div>
  )
}
