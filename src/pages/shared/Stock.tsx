import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'
import { Card, SectionLabel, Button, Banner, Input, Select, Chip, PageSkeleton, EmptyState } from '../../components/ui'
import { todayISO, formatDate } from '../../lib/dates'
import type { Employee, StockCategory, StockCount, StockReason, StockReasonType, StockTally } from '../../types/database'

export const REASON_LABELS: Record<StockReasonType, string> = {
  sold: 'Sold',
  memo: 'Out on memo',
  owner_taken: 'Taken by owner',
  new_stock: 'New stock added',
  returned: 'Returned (memo/repair)',
  other: 'Other',
}

type ReasonDraft = { reason: StockReasonType; quantity: string; note: string }

export default function StockPage() {
  const { employee } = useAuth()
  const [categories, setCategories] = useState<StockCategory[]>([])
  const [expected, setExpected] = useState<Map<string, number>>(new Map())
  const [today, setToday] = useState<StockTally | null>(null)
  const [counts, setCounts] = useState<StockCount[]>([])
  const [reasons, setReasons] = useState<StockReason[]>([])
  const [history, setHistory] = useState<StockTally[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, ReasonDraft[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const load = useCallback(async () => {
    const [{ data: cats }, { data: exp }, { data: tallies }, { data: emps }] = await Promise.all([
      supabase.from('stock_categories').select('*').eq('is_active', true).order('sort'),
      supabase.rpc('get_stock_expected'),
      supabase.from('stock_tallies').select('*').order('date', { ascending: false }).limit(8),
      supabase.from('employees').select('*'),
    ])
    setCategories(cats ?? [])
    setExpected(new Map((exp ?? []).map((e: { category_id: string; expected: number }) => [e.category_id, e.expected])))
    setEmployees(emps ?? [])
    const todayTally = (tallies ?? []).find((t: StockTally) => t.date === todayISO()) ?? null
    setToday(todayTally)
    setHistory((tallies ?? []).filter((t: StockTally) => t.date !== todayISO()))
    if (todayTally) {
      const { data: c } = await supabase.from('stock_counts').select('*').eq('tally_id', todayTally.id)
      setCounts(c ?? [])
      if (c && c.length > 0) {
        const { data: r } = await supabase
          .from('stock_reasons')
          .select('*')
          .in('count_id', c.map((x: StockCount) => x.id))
        setReasons(r ?? [])
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function varianceFor(catId: string): number | null {
    const exp = expected.get(catId)
    const raw = drafts[catId]
    if (exp === undefined || raw === undefined || raw === '') return null
    return Number(raw) - exp
  }

  function reasonSum(catId: string): number {
    return (reasonDrafts[catId] ?? []).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  }

  async function submit() {
    if (!employee) return
    setError(null)
    for (const cat of categories) {
      if (drafts[cat.id] === undefined || drafts[cat.id] === '') {
        setError(`Enter a count for ${cat.name}.`)
        return
      }
      const v = varianceFor(cat.id)
      if (v !== null && v !== 0 && reasonSum(cat.id) !== Math.abs(v)) {
        setError(`${cat.name}: difference of ${Math.abs(v)} piece(s), but reasons cover ${reasonSum(cat.id)}. Every piece must be accounted for.`)
        return
      }
    }
    setSaving(true)
    const items = categories.map((cat) => ({
      category_id: cat.id,
      counted: Number(drafts[cat.id]),
      reasons: (reasonDrafts[cat.id] ?? [])
        .filter((r) => Number(r.quantity) > 0)
        .map((r) => ({ reason: r.reason, quantity: Number(r.quantity), note: r.note })),
    }))
    const { error } = await supabase.rpc('submit_stock_tally', { p_items: items })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setDrafts({})
    setReasonDrafts({})
    await load()
  }

  async function decide(approve: boolean) {
    if (!today) return
    setError(null)
    setDeciding(true)
    const { error } = await supabase.rpc('decide_stock_tally', {
      p_tally_id: today.id,
      p_approve: approve,
      p_note: approve ? null : rejectNote,
    })
    setDeciding(false)
    if (error) {
      setError(error.message)
      return
    }
    setRejectNote('')
    await load()
  }

  function name(id: string | null) {
    return employees.find((e) => e.id === id)?.name?.split(' ')[0] ?? '—'
  }

  async function claim() {
    if (!today) return
    setError(null)
    setDeciding(true)
    const { error } = await supabase.rpc('claim_stock_verification', { p_tally_id: today.id })
    setDeciding(false)
    if (error) {
      setError(error.message)
    }
    await load()
  }

  if (loading) return <PageSkeleton />

  const iAmApprover = today?.status === 'pending_approval' && today.approver_id === employee?.id
  const iAmSubmitter = today?.submitted_by === employee?.id
  const unclaimed = today?.status === 'pending_approval' && today.approver_id === null
  const canClaim = unclaimed && !iAmSubmitter && employee?.role === 'employee'
  const showForm = !today || today.status === 'rejected'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Stock Tally</h1>
        <p className="mt-1 text-sm text-ink-soft">End-of-day count, checked against the last approved stock.</p>
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {today?.status === 'rejected' && (
        <Banner tone="warning">
          Rejected by {name(today.approver_id)}: “{today.approver_note}” — recount and submit again.
        </Banner>
      )}

      {/* Verification (assigned random checker or waiting view) */}
      {today?.status === 'pending_approval' && (
        <Card className={iAmApprover || canClaim ? '!border-gold-400' : ''}>
          <SectionLabel>
            {unclaimed
              ? iAmSubmitter
                ? 'Waiting for a teammate to volunteer as verifier'
                : 'This count needs a verifier'
              : iAmApprover
                ? 'You are verifying today’s stock'
                : `${name(today.approver_id)} is verifying`}
          </SectionLabel>
          <p className="mb-3 text-xs text-ink-soft">Counted by {name(today.submitted_by)}.</p>
          <TallyTable categories={categories} counts={counts} reasons={reasons} />

          {canClaim && (
            <div className="mt-4 border-t border-hairline pt-3 dark:border-hairline-dark">
              <Button busy={deciding} onClick={claim} className="w-full">
                I'll verify this count
              </Button>
              <p className="mt-2 text-center text-xs text-ink-soft">
                Your name goes on today's tally as the verifier.
              </p>
            </div>
          )}

          {iAmApprover && (
            <div className="mt-4 space-y-2 border-t border-hairline pt-3 dark:border-hairline-dark">
              <div className="flex gap-2">
                <Button busy={deciding} onClick={() => decide(true)} className="flex-1">
                  Stock is correct — Approve
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="What looks wrong? (required to reject)"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  className="!py-2 text-xs"
                />
                <Button variant="secondary" busy={deciding} onClick={() => decide(false)} className="!py-2 text-xs">
                  Reject
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {today?.status === 'approved' && (
        <Card>
          <div className="flex items-center justify-between">
            <SectionLabel>Today's tally</SectionLabel>
            <Chip tone="sage">Approved</Chip>
          </div>
          <p className="mb-3 text-xs text-ink-soft">
            Counted by {name(today.submitted_by)}
            {today.approver_id ? `, verified by ${name(today.approver_id)}` : ' (auto-approved)'}
          </p>
          <TallyTable categories={categories} counts={counts} reasons={reasons} />
        </Card>
      )}

      {/* Count form */}
      {showForm && (
        <Card>
          <SectionLabel>Today's count — {format(new Date(), 'd MMMM')}</SectionLabel>
          <div className="space-y-4">
            {categories.map((cat) => {
              const exp = expected.get(cat.id)
              const v = varianceFor(cat.id)
              const needsReasons = v !== null && v !== 0
              const covered = reasonSum(cat.id)
              return (
                <div key={cat.id} className="border-b border-hairline pb-4 last:border-0 last:pb-0 dark:border-hairline-dark">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{cat.name}</p>
                      <p className="text-xs text-ink-soft">
                        {exp !== undefined ? `System stock: ${exp}` : 'First count — sets the baseline'}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="Count"
                      value={drafts[cat.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [cat.id]: e.target.value }))}
                      className="!w-24 text-center"
                    />
                  </div>

                  {needsReasons && (
                    <div className="mt-2.5 rounded-xl bg-ivory p-3 dark:bg-espresso">
                      <p className={`text-xs font-medium ${covered === Math.abs(v!) ? 'text-sage-500' : 'text-bronze-500'}`}>
                        {v! < 0 ? `${Math.abs(v!)} piece(s) missing` : `${v} piece(s) extra`} — reasons cover {covered} of {Math.abs(v!)}
                      </p>
                      {(reasonDrafts[cat.id] ?? []).map((r, i) => (
                        <div key={i} className="mt-2 flex gap-1.5">
                          <Input
                            type="number"
                            min={1}
                            value={r.quantity}
                            onChange={(e) =>
                              setReasonDrafts((rd) => ({
                                ...rd,
                                [cat.id]: rd[cat.id].map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)),
                              }))
                            }
                            className="!w-16 !px-2 !py-1.5 text-center text-xs"
                          />
                          <Select
                            value={r.reason}
                            onChange={(e) =>
                              setReasonDrafts((rd) => ({
                                ...rd,
                                [cat.id]: rd[cat.id].map((x, j) => (j === i ? { ...x, reason: e.target.value as StockReasonType } : x)),
                              }))
                            }
                            className="!w-auto flex-1 !px-2 !py-1.5 text-xs"
                          >
                            {Object.entries(REASON_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </Select>
                          <Input
                            placeholder="Note"
                            value={r.note}
                            onChange={(e) =>
                              setReasonDrafts((rd) => ({
                                ...rd,
                                [cat.id]: rd[cat.id].map((x, j) => (j === i ? { ...x, note: e.target.value } : x)),
                              }))
                            }
                            className="!w-24 !px-2 !py-1.5 text-xs"
                          />
                          <button
                            onClick={() =>
                              setReasonDrafts((rd) => ({ ...rd, [cat.id]: rd[cat.id].filter((_, j) => j !== i) }))
                            }
                            className="text-ink-soft hover:text-brick-500"
                            aria-label="Remove reason"
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          setReasonDrafts((rd) => ({
                            ...rd,
                            [cat.id]: [...(rd[cat.id] ?? []), { reason: v! < 0 ? 'sold' : 'new_stock', quantity: '1', note: '' }],
                          }))
                        }
                        className="mt-2 flex items-center gap-1 text-xs font-medium text-gold-600"
                      >
                        <Plus size={13} strokeWidth={2} /> Add reason
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Button busy={saving} onClick={submit} className="mt-4 w-full">
            Submit for verification
          </Button>
          <p className="mt-2 text-center text-xs text-ink-soft">
            A teammate will volunteer to verify your count — both names go on the record.
          </p>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <SectionLabel>Previous tallies</SectionLabel>
          <ul className="divide-y divide-hairline dark:divide-hairline-dark">
            {history.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink dark:text-ivory-dark-text">{formatDate(t.date)}</span>
                <span className="flex items-center gap-2 text-xs text-ink-soft">
                  {name(t.submitted_by)} → {name(t.approver_id)}
                  <Chip tone={t.status === 'approved' ? 'sage' : t.status === 'rejected' ? 'brick' : 'neutral'}>
                    {t.status === 'pending_approval' ? 'pending' : t.status}
                  </Chip>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

export function TallyTable({
  categories,
  counts,
  reasons,
}: {
  categories: StockCategory[]
  counts: StockCount[]
  reasons: StockReason[]
}) {
  if (counts.length === 0) return <EmptyState>No counts recorded.</EmptyState>
  return (
    <div className="space-y-2">
      {counts.map((c) => {
        const cat = categories.find((x) => x.id === c.category_id)
        const variance = c.expected === null ? null : c.counted - c.expected
        const countReasons = reasons.filter((r) => r.count_id === c.id)
        return (
          <div key={c.id} className="rounded-xl border border-hairline p-2.5 dark:border-hairline-dark">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-ink dark:text-ivory-dark-text">{cat?.name ?? '—'}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-ink-soft">{c.expected !== null ? `${c.expected} → ` : ''}{c.counted}</span>
                {variance === null ? (
                  <Chip tone="neutral">baseline</Chip>
                ) : variance === 0 ? (
                  <Chip tone="sage">tallies ✓</Chip>
                ) : (
                  <Chip tone={variance < 0 ? 'brick' : 'bronze'}>{variance > 0 ? `+${variance}` : variance}</Chip>
                )}
              </span>
            </div>
            {countReasons.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {countReasons.map((r) => (
                  <li key={r.id} className="text-xs text-ink-soft">
                    {r.quantity} × {REASON_LABELS[r.reason]}
                    {r.note ? ` — ${r.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
