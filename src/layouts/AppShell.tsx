import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const EMPLOYEE_NAV = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/leave', label: 'Leave', icon: '📅' },
  { to: '/tasks', label: 'Tasks', icon: '✅' },
  { to: '/log', label: 'Log', icon: '📝' },
  { to: '/notes', label: 'Notes', icon: '💎' },
]

const ADMIN_NAV = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/admin/attendance', label: 'Attendance', icon: '📍' },
  { to: '/admin/leave', label: 'Leave', icon: '📅' },
  { to: '/admin/tasks', label: 'Tasks', icon: '✅' },
  { to: '/admin/logs', label: 'Logs', icon: '📝' },
]

export default function AppShell() {
  const { employee, signOut } = useAuth()
  const nav = employee?.role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-stone-50 dark:bg-stone-900">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-stone-50/90 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <div>
          <p className="font-semibold text-stone-900 dark:text-stone-50">Kaha</p>
          <p className="text-xs text-stone-500">{employee?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {employee?.role === 'admin' && (
            <NavLink to="/announcements" className="text-xs text-accent-600 underline">
              Announcements
            </NavLink>
          )}
          <button onClick={signOut} className="text-xs font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200">
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-lg border-t border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-800/95">
        <div className="flex justify-around">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                  isActive ? 'text-accent-600' : 'text-stone-500'
                }`
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          {employee?.role === 'employee' && (
            <NavLink
              to="/announcements"
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                  isActive ? 'text-accent-600' : 'text-stone-500'
                }`
              }
            >
              <span className="text-lg leading-none">📣</span>
              Notices
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  )
}
