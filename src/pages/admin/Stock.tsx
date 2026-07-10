import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { Card, SectionLabel, Button, Banner, Input, Chip, PageSkeleton, EmptyState } from '../../components/ui'
import { TallyTable } from '../shared/Stock'
import { formatDate } from '../../lib/dates'
import type { Employee, StockCategory, StockCount, StockReason, StockTally } from '../../types/database'

export default function AdminStock() {
  const [categories, setCategories] = useState<StockCategory[]>([])
  const [tallies, setTallies] = useState<StockTally[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [counts, setCounts] = useState<StockCount[]>([])
  const [reasons, setReasons] = useState<StockReason[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [newCat, setNewCat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: cats }, { data: t }, { data: emps }, { data: c }, { data: r }] = await Promise.all([
      supabase.from('stock_categories').select('*').order('sort'),
      supabase.from('stock_tallies').select('*').order('date', { ascending: false }).limit(30),
      supabase.from('employees').select('*'),
      supabase.from('stock_counts').select('*'),
      supabase.from('stock_reasons').select('*'),
    ])
    setCategories(cats ?? [])
    setTallies(t ?? [])
    setEmployees(emps ?? [])
    setCounts(c ?? [])
    setReasons(r ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function name(id: string | null) {
    return employees.find((e) => e.id === id)?.name?.split(' ')[0] ?? '—'
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault()
    if (!newCat.trim()) return
    setError(null)
    const { error } = await supabase
      .from('stock_categories')
      .insert({ name: newCat.trim(), sort: categories.length + 1 })
    if (error) {
      setError(error.message)
      return
    }
    setNewCat('')
    await load()
  }

  async function toggleCategory(cat: StockCategory) {
    await supabase.from('stock_categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    await load()
  }

  async function overrideApprove(t: StockTally) {
    setError(null)
    const { error } = await supabase.rpc('decide_stock_tally', { p_tally_id: t.id, p_approve: true, p_note: 'Approved by admin (override)' })
    if (error) setError(error.message)
    await load()
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Stock Tally</h1>
      {error && <Banner tone="error">{error}</Banner>}

      <Card>
        <SectionLabel>Categories</SectionLabel>
        <ul className="mb-3 space-y-1.5">
          {categories.map((cat) => (
            <li key={cat.id} className="flex items-center justify-between text-sm">
              <span className={cat.is_active ? 'text-ink dark:text-ivory-dark-text' : 'text-ink-soft line-through'}>
                {cat.name}
              </span>
              <button onClick={() => toggleCategory(cat)} className="text-xs font-medium text-gold-600">
                {cat.is_active ? 'Disable' : 'Enable'}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addCategory} className="flex gap-2">
          <Input placeholder='New category, e.g. "Bangles"' value={newCat} onChange={(e) => setNewCat(e.target.value)} className="!py-2 text-sm" />
          <Button type="submit" className="!py-2 text-xs">Add</Button>
        </form>
      </Card>

      <Card>
        <SectionLabel>Tallies</SectionLabel>
        {tallies.length === 0 && <EmptyState>No tallies yet.</EmptyState>}
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {tallies.map((t) => {
            const tallyCounts = counts.filter((c) => c.tally_id === t.id)
            const totalVariance = tallyCounts.reduce((s, c) => s + (c.expected !== null ? c.counted - c.expected : 0), 0)
            const isOpen = expanded === t.id
            return (
              <li key={t.id} className="py-2.5">
                <button onClick={() => setExpanded(isOpen ? null : t.id)} className="flex w-full items-center justify-between gap-2 text-left">
                  <div>
                    <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{formatDate(t.date)}</p>
                    <p className="text-xs text-ink-soft">
                      {name(t.submitted_by)} → {name(t.approver_id)}
                      {totalVariance !== 0 && ` · net ${totalVariance > 0 ? '+' : ''}${totalVariance} pieces`}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <Chip tone={t.status === 'approved' ? 'sage' : t.status === 'rejected' ? 'brick' : 'bronze'}>
                      {t.status === 'pending_approval' ? 'pending' : t.status}
                    </Chip>
                    {isOpen ? <ChevronUp size={15} className="text-ink-soft" /> : <ChevronDown size={15} className="text-ink-soft" />}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2.5">
                    <TallyTable categories={categories} counts={tallyCounts} reasons={reasons.filter((r) => tallyCounts.some((c) => c.id === r.count_id))} />
                    {t.approver_note && <p className="mt-2 text-xs text-ink-soft">Note: {t.approver_note}</p>}
                    {t.status === 'pending_approval' && (
                      <Button variant="secondary" className="mt-2 !py-1.5 text-xs" onClick={() => overrideApprove(t)}>
                        Approve as admin (override)
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
