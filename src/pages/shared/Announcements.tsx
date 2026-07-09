import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, SectionLabel, Button, Input, Textarea, Chip, EmptyState, PageSkeleton } from '../../components/ui'
import type { Announcement, AnnouncementRead } from '../../types/database'

export default function AnnouncementsPage() {
  const { employee } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [reads, setReads] = useState<AnnouncementRead[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    if (!employee) return
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('announcement_reads').select('*').eq('employee_id', employee.id),
    ])
    setAnnouncements(a ?? [])
    setReads(r ?? [])
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!employee || !announcements || announcements.length === 0) return
    const readIds = new Set(reads.map((r) => r.announcement_id))
    const unread = announcements.filter((a) => !readIds.has(a.id))
    if (unread.length === 0) return
    ;(async () => {
      await supabase
        .from('announcement_reads')
        .insert(unread.map((a) => ({ announcement_id: a.id, employee_id: employee.id })))
      const { data: r } = await supabase.from('announcement_reads').select('*').eq('employee_id', employee.id)
      setReads(r ?? [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, employee])

  async function post(e: FormEvent) {
    e.preventDefault()
    if (!employee || !title.trim()) return
    setPosting(true)
    await supabase.from('announcements').insert({
      title: title.trim(),
      body: body.trim() || null,
      created_by: employee.id,
    })
    setTitle('')
    setBody('')
    setPosting(false)
    await load()
  }

  const readIds = new Set(reads.map((r) => r.announcement_id))

  if (announcements === null) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">
        {employee?.role === 'admin' ? 'Announcements' : 'Notices'}
      </h1>

      {employee?.role === 'admin' && (
        <Card>
          <SectionLabel>Post an announcement</SectionLabel>
          <form onSubmit={post} className="space-y-2">
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Details (optional)" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
            <Button type="submit" busy={posting} className="w-full !py-2 text-xs">Post</Button>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {announcements.map((a) => {
          const unread = !readIds.has(a.id)
          return (
            <Card key={a.id} className={unread ? '!border-l-2 !border-l-gold-500' : ''}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-ink dark:text-ivory-dark-text">{a.title}</p>
                {unread && <Chip tone="gold">New</Chip>}
              </div>
              {a.body && <p className="mt-1.5 text-sm text-ink-soft">{a.body}</p>}
              <p className="label-caps mt-3">{format(new Date(a.created_at), 'd MMM yyyy')}</p>
            </Card>
          )
        })}
        {announcements.length === 0 && (
          <Card>
            <EmptyState>No announcements yet.</EmptyState>
          </Card>
        )}
      </div>
    </div>
  )
}
