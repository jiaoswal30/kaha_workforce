import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home, CalendarDays, CheckSquare, NotebookPen, MoreHorizontal,
  MapPin, Users, Gem, Megaphone, MessageCircleWarning, BarChart3, ClipboardList, LogOut, X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

type NavItem = { to: string; label: string; icon: typeof Home }

const EMPLOYEE_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/leave', label: 'Leave', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/log', label: 'Log', icon: NotebookPen },
]

const EMPLOYEE_MORE: NavItem[] = [
  { to: '/concerns', label: 'Concerns', icon: MessageCircleWarning },
  { to: '/notes', label: 'Inventory notes', icon: Gem },
  { to: '/announcements', label: 'Notices', icon: Megaphone },
]

const ADMIN_NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: Home },
  { to: '/admin/attendance', label: 'Attendance', icon: MapPin },
  { to: '/admin/leave', label: 'Leave', icon: CalendarDays },
  { to: '/admin/team', label: 'Team', icon: Users },
]

const ADMIN_MORE: NavItem[] = [
  { to: '/admin/tasks', label: 'Tasks & goals', icon: ClipboardList },
  { to: '/admin/logs', label: 'Daily logs', icon: NotebookPen },
  { to: '/admin/concerns', label: 'Concerns', icon: MessageCircleWarning },
  { to: '/admin/performance', label: 'Performance', icon: BarChart3 },
  { to: '/notes', label: 'Inventory notes', icon: Gem },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
]

export default function AppShell() {
  const { employee, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()
  const isAdmin = employee?.role === 'admin'
  const nav = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV
  const more = isAdmin ? ADMIN_MORE : EMPLOYEE_MORE
  const moreActive = more.some((m) => m.to === location.pathname)

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-ivory/90 px-5 py-3 backdrop-blur dark:border-hairline-dark dark:bg-espresso/90">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl text-ink dark:text-ivory-dark-text">Kaha</span>
          <span className="label-caps">Staff</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-soft">{employee?.name?.split(' ')[0]}</span>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="text-ink-soft transition-colors hover:text-ink dark:hover:text-ivory-dark-text"
          >
            <LogOut size={16} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <main key={location.pathname} className="page-enter flex-1 px-5 pb-28 pt-5">
        <Outlet />
      </main>

      {moreOpen && (
        <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-ink/25" />
          <div
            className="page-enter absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl border-t border-hairline bg-white p-5 pb-8 dark:border-hairline-dark dark:bg-espresso-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="label-caps">More</p>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="text-ink-soft">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {more.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${
                      isActive
                        ? 'border-gold-400 text-gold-600'
                        : 'border-hairline text-ink hover:border-gold-400/50 dark:border-hairline-dark dark:text-ivory-dark-text'
                    }`
                  }
                >
                  <item.icon size={18} strokeWidth={1.5} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t border-hairline bg-white/95 backdrop-blur dark:border-hairline-dark dark:bg-espresso-2/95">
        <div className="flex justify-around pb-[env(safe-area-inset-bottom)]">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium tracking-wide ${
                  isActive ? 'text-gold-600' : 'text-ink-soft'
                }`
              }
            >
              <item.icon size={18} strokeWidth={1.5} />
              {item.label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium tracking-wide ${
              moreActive ? 'text-gold-600' : 'text-ink-soft'
            }`}
          >
            <MoreHorizontal size={18} strokeWidth={1.5} />
            More
          </button>
        </div>
      </nav>
    </div>
  )
}
