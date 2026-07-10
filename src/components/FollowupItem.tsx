import { useState } from 'react'
import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import { Chip, Button, Select } from './ui'
import { FOLLOWUP_TYPE_LABELS, isDueToday, isOverdue } from '../lib/followups'
import { formatDate } from '../lib/dates'
import type { Employee, Followup } from '../types/database'

export default function FollowupItem({
  followup: f,
  chain,
  onDone,
  busy,
  passTo,
  onPass,
}: {
  followup: Followup
  /** Names of everyone who has held this follow-up, in order (admin view). */
  chain?: string[]
  onDone?: (f: Followup) => void
  busy?: boolean
  /** Teammates this follow-up can be passed to (employee view). */
  passTo?: Employee[]
  onPass?: (f: Followup, toEmployeeId: string) => void
}) {
  const [passing, setPassing] = useState(false)
  const overdue = isOverdue(f)
  const dueToday = isDueToday(f)
  const wasPassed = (chain?.length ?? 0) > 1

  return (
    <li
      className={`rounded-xl border p-3.5 ${
        overdue
          ? 'border-brick-500/40'
          : dueToday
            ? 'border-bronze-500/40'
            : 'border-hairline dark:border-hairline-dark'
      } ${f.status === 'done' ? 'opacity-55' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink dark:text-ivory-dark-text">
            {f.customer_name}
            <Chip tone="slate">{FOLLOWUP_TYPE_LABELS[f.type]}</Chip>
            {f.priority === 'high' && <Chip tone="brick">High</Chip>}
            {f.priority === 'low' && <Chip tone="neutral">Low</Chip>}
            {wasPassed && <Chip tone="gold">passed on</Chip>}
          </p>
          {f.contact && <p className="mt-0.5 text-xs text-ink-soft">{f.contact}</p>}
          {f.details && <p className="mt-1 text-xs text-ink dark:text-ivory-dark-text">{f.details}</p>}
          <p className={`mt-1.5 text-xs ${overdue ? 'font-medium text-brick-500' : dueToday ? 'font-medium text-bronze-500' : 'text-ink-soft'}`}>
            {f.status === 'done'
              ? `Done ${f.completed_at ? format(new Date(f.completed_at), 'd MMM, h:mm a') : ''}`
              : overdue
                ? `Overdue — was due ${formatDate(f.due_date)}`
                : dueToday
                  ? 'Due today'
                  : `Due ${formatDate(f.due_date)}`}
          </p>
          {chain && chain.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-soft">
              {chain.map((n, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight size={12} strokeWidth={2} className="text-gold-500" />}
                  <span className={i === chain.length - 1 ? 'font-medium text-ink dark:text-ivory-dark-text' : ''}>{n}</span>
                </span>
              ))}
            </p>
          )}
        </div>
        {f.status === 'pending' && onDone && (
          <Button variant="secondary" busy={busy} onClick={() => onDone(f)} className="shrink-0 !px-3 !py-1.5 text-xs">
            Done ✓
          </Button>
        )}
      </div>

      {f.status === 'pending' && passTo && passTo.length > 0 && onPass && (
        <div className="mt-2 border-t border-hairline pt-2 dark:border-hairline-dark">
          {passing ? (
            <div className="flex items-center gap-2">
              <Select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onPass(f, e.target.value)
                  setPassing(false)
                }}
                className="!w-auto flex-1 !py-1.5 text-xs"
              >
                <option value="" disabled>Pass to…</option>
                {passTo.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </Select>
              <button onClick={() => setPassing(false)} className="text-xs text-ink-soft">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setPassing(true)} className="flex items-center gap-1 text-xs font-medium text-gold-600">
              Pass to a teammate <ArrowRight size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      )}
    </li>
  )
}
