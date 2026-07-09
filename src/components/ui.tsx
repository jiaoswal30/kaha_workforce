import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { AttendanceStatus } from '../types/database'

/* ---------- layout ---------- */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[14px] border border-hairline bg-white p-5 dark:border-hairline-dark dark:bg-espresso-2 ${className}`}>
      {children}
    </div>
  )
}

/** Small-caps section label with a short gold rule beneath. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="label-caps">{children}</p>
      <div className="mt-1.5 h-px w-6 bg-gold-500" />
    </div>
  )
}

/* ---------- controls ---------- */

export function Button({
  variant = 'primary',
  busy = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors duration-150 active:scale-[0.99] disabled:opacity-45 disabled:active:scale-100'
  const variants: Record<string, string> = {
    primary: 'bg-ink text-ivory hover:bg-black dark:bg-ivory-dark-text dark:text-espresso dark:hover:bg-white',
    secondary:
      'border border-hairline bg-white text-ink hover:border-gold-400 dark:border-hairline-dark dark:bg-espresso-2 dark:text-ivory-dark-text',
    danger: 'bg-brick-500 text-white hover:opacity-90',
    ghost: 'bg-transparent text-ink-soft hover:text-ink dark:hover:text-ivory-dark-text',
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={disabled || busy} {...props}>
      {busy && <span className="spin-diamond text-gold-400">◇</span>}
      {children}
    </button>
  )
}

const fieldClasses =
  'w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft/60 focus:border-gold-500 dark:border-hairline-dark dark:bg-espresso dark:text-ivory-dark-text'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return <input className={`${fieldClasses} ${className}`} {...rest} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props
  return <textarea className={`${fieldClasses} ${className}`} {...rest} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props
  return <select className={`${fieldClasses} ${className}`} {...rest} />
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-[13px] font-medium text-ink dark:text-ivory-dark-text">{children}</label>
}

/* ---------- status ---------- */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  present: { label: 'Present', cls: 'bg-sage-tint text-sage-500' },
  half_day: { label: 'Half day', cls: 'bg-bronze-tint text-bronze-500' },
  absent: { label: 'Absent', cls: 'bg-brick-tint text-brick-500' },
  week_off: { label: 'Week off', cls: 'bg-slate-tint text-slate-500' },
  paid_leave: { label: 'Paid leave', cls: 'bg-gold-tint text-gold-600' },
  unpaid_leave: { label: 'Unpaid leave', cls: 'bg-brick-tint text-brick-500' },
}

export function StatusBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) return <span className="text-sm text-ink-soft">—</span>
  const meta = STATUS_META[status]
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide whitespace-nowrap ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'gold' | 'sage' | 'bronze' | 'brick' | 'slate'
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ivory text-ink-soft border border-hairline dark:bg-espresso dark:border-hairline-dark',
    gold: 'bg-gold-tint text-gold-600',
    sage: 'bg-sage-tint text-sage-500',
    bronze: 'bg-bronze-tint text-bronze-500',
    brick: 'bg-brick-tint text-brick-500',
    slate: 'bg-slate-tint text-slate-500',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  )
}

/* ---------- feedback ---------- */

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' | 'warning' }) {
  const styles = {
    info: 'bg-gold-tint text-gold-600 border-gold-400/30',
    error: 'bg-brick-tint text-brick-500 border-brick-500/25',
    success: 'bg-sage-tint text-sage-500 border-sage-500/25',
    warning: 'bg-bronze-tint text-bronze-500 border-bronze-500/25',
  }
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-soft">{children}</p>
}

/* ---------- loading ---------- */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

/** Standard page-loading state: three card-shaped skeletons. */
export function PageSkeleton() {
  return (
    <div className="space-y-4 pt-1">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-36 rounded-[14px]" />
      <Skeleton className="h-24 rounded-[14px]" />
      <Skeleton className="h-24 rounded-[14px]" />
    </div>
  )
}

/** Full-screen boot loader: serif K monogram with gold shimmer sweep. */
export function Monogram() {
  return (
    <div className="flex h-screen items-center justify-center bg-ivory dark:bg-espresso">
      <div className="shimmer-wrap px-8 py-4">
        <span className="font-display text-6xl text-ink dark:text-ivory-dark-text">K</span>
        <div className="shimmer-bar" />
      </div>
    </div>
  )
}

/** Thin circular progress ring (weekly goals etc.). */
export function ProgressRing({ value, total, size = 56 }: { value: number; total: number; size?: number }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const frac = total > 0 ? value / total : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" className="stroke-hairline dark:stroke-hairline-dark" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        className="stroke-gold-500 transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  )
}
