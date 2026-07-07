import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { AttendanceStatus } from '../types/database'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-800/40 ${className}`}>
      {children}
    </div>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const base = 'rounded-xl px-4 py-2.5 font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
  const variants: Record<string, string> = {
    primary: 'bg-accent-600 text-white hover:bg-accent-700',
    secondary: 'bg-stone-100 text-stone-800 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

const STATUS_STYLES: Record<string, string> = {
  present: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  half_day: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  absent: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  week_off: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  paid_leave: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  unpaid_leave: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const STATUS_LABELS: Record<string, string> = {
  present: 'Present',
  half_day: 'Half day',
  absent: 'Absent',
  week_off: 'Week off',
  paid_leave: 'Paid leave',
  unpaid_leave: 'Unpaid leave',
}

export function StatusBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) return <span className="text-stone-400">—</span>
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-stone-500">{children}</p>
}

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' }) {
  const styles = {
    info: 'bg-accent-50 text-accent-700 border-accent-100',
    error: 'bg-red-50 text-red-700 border-red-100',
    success: 'bg-green-50 text-green-700 border-green-100',
  }
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>
}
