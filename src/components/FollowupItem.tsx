import { format } from 'date-fns'
import { Chip, Button } from './ui'
import { FOLLOWUP_TYPE_LABELS, isDueToday, isOverdue } from '../lib/followups'
import { formatDate } from '../lib/dates'
import type { Followup } from '../types/database'

export default function FollowupItem({
  followup: f,
  ownerName,
  onDone,
  busy,
}: {
  followup: Followup
  ownerName?: string
  onDone?: (f: Followup) => void
  busy?: boolean
}) {
  const overdue = isOverdue(f)
  const dueToday = isDueToday(f)
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
            {ownerName ? ` · ${ownerName}` : ''}
          </p>
        </div>
        {f.status === 'pending' && onDone && (
          <Button variant="secondary" busy={busy} onClick={() => onDone(f)} className="shrink-0 !px-3 !py-1.5 text-xs">
            Done ✓
          </Button>
        )}
      </div>
    </li>
  )
}
