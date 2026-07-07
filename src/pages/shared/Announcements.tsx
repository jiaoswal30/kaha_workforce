import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate } from '../../lib/dates'
import { Card, Button, EmptyState } from '../../components/ui'
import type { Announcement, AnnouncementRead } from '../../types/database'

export default function AnnouncementsPage() {
  const { employee } = useAuth()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [reads, setReads] = useState<AnnouncementRead[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!employee) return
    const [{ data: a }, { data: r }] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('announcement_reads').select('*').eq('employee_id', employee.id),
    ])
    setAnnouncements(a ?? [])
    setReads(r ?? [])
    setLoading(false)
  }, [employee])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!employee || announcements.length === 0) return
    const readIds = new Set(reads.map((r) => r.announcement_id))
    const unread = announcements.filter((a) => !readIds.has(a.id))
    if (unread.length === 0) return
    ;(async () => {
      await supabase.from('announcement_reads').insert(unread.map((a) => ({ announcement_id: a.id, employee_id: employee.id })))
      const { data: r } = await supabase.from('announcement_reads').select('*').eq('employee_id', employee.id)
      setReads(r ?? [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements, employee])

  async function post(e: FormEvent) {
    e.preventDefault()
    if (!employee || !title.trim()) return
    await supabase.from('announcements').insert({ title: title.trim(), body: body.trim() || null, created_by: employee.id })
    setTitle('')
    setBody('')
    await load()
  }

  const readIds = new Set(reads.map((r) => r.announcement_id))

  if (loading) return <p className="text-stone-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-50">Announcements</h1>

      {employee?.role === 'admin' && (
        <Card>
          <p className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-300">Post an announcement</p>
          <form onSubmit={post} className="space-y-2">
            <input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900"
            />
            <textarea
              placeholder="Details (optional)"
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none dark:border-stone-700 dark:bg-stone-900"
            />
            <Button type="submit" className="w-full py-2 text-sm">Post</Button>
          </form>
        </Card>
      )}

      <div className="space-y-2">
        {announcements.map((a) => {
          const unread = !readIds.has(a.id)
          return (
            <Card key={a.id} className={unread ? 'border-accent-400' : ''}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-stone-900 dark:text-stone-50">{a.title}</p>
                {unread && <span className="rounded-full bg-accent-600 px-2 py-0.5 text-[10px] font-medium text-white">New</span>}
              </div>
              {a.body && <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{a.body}</p>}
              <p className="mt-1 text-xs text-stone-400">{formatDate(a.created_at.slice(0, 10))}</p>
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
