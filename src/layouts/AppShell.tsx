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
  const allItems = [...nav, ...more]
  const moreActive = more.some((m) => m.to === location.pathname)

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-hairline lg:bg-white lg:dark:border-hairline-dark lg:dark:bg-espresso-2">
        <div className="px-6 pb-6 pt-8">
          <p className="font-display text-2xl text-ink dark:text-ivory-dark-text">Kaha</p>
          <p className="label-caps mt-0.5">Staff Manager</p>
          <div className="mt-3 h-px w-6 bg-gold-500" />
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {allItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-gold-tint font-medium text-gold-600 dark:bg-espresso'
                    : 'text-ink-soft hover:text-ink dark:hover:text-ivory-dark-text'
                }`
              }
            >
              <item.icon size={17} strokeWidth={1.5} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-hairline px-6 py-4 dark:border-hairline-dark">
          <p className="truncate text-sm font-medium text-ink dark:text-ivory-dark-text">{employee?.name}</p>
          <button
            onClick={signOut}
            className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft transition-colors hover:text-ink dark:hover:text-ivory-dark-text"
          >
            <LogOut size={13} strokeWidth={1.5} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-60">
        {/* Mobile header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-ivory/90 px-5 py-3 backdrop-blur lg:hidden dark:border-hairline-dark dark:bg-espresso/90">
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

        <main
          key={location.pathname}
          className="page-enter mx-auto w-full max-w-md flex-1 px-5 pb-28 pt-5 lg:max-w-3xl lg:px-10 lg:pb-16 lg:pt-10"
        >
          <Outlet />
        </main>

        {/* Mobile "More" sheet */}
        {moreOpen && (
          <div className="fixed inset-0 z-20 lg:hidden" onClick={() => setMoreOpen(false)}>
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

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t border-hairline bg-white/95 backdrop-blur lg:hidden dark:border-hairline-dark dark:bg-espresso-2/95">
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
    </div>
  )
}
