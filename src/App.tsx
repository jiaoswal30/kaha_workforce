import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Monogram } from './components/ui'
import Login from './pages/Login'
import Kiosk from './pages/Kiosk'
import AppShell from './layouts/AppShell'
import EmployeeHome from './pages/employee/Home'
import EmployeeLeave from './pages/employee/Leave'
import EmployeeTasks from './pages/employee/Tasks'
import EmployeeDailyLog from './pages/employee/DailyLog'
import Concerns from './pages/employee/Concerns'
import NotesPage from './pages/shared/Notes'
import AnnouncementsPage from './pages/shared/Announcements'
import AdminHome from './pages/admin/Home'
import AdminAttendance from './pages/admin/Attendance'
import AdminLeave from './pages/admin/Leave'
import AdminTasks from './pages/admin/Tasks'
import AdminLogs from './pages/admin/Logs'
import AdminTeam from './pages/admin/Team'
import AdminConcerns from './pages/admin/Concerns'
import AdminPerformance from './pages/admin/Performance'

function Gate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <Monogram />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RoleHome() {
  const { employee } = useAuth()
  if (!employee) return null
  return employee.role === 'admin' ? <AdminHome /> : <EmployeeHome />
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { employee } = useAuth()
  if (employee?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

const adminRoutes = [
  { path: '/admin/attendance', element: <AdminAttendance /> },
  { path: '/admin/leave', element: <AdminLeave /> },
  { path: '/admin/tasks', element: <AdminTasks /> },
  { path: '/admin/logs', element: <AdminLogs /> },
  { path: '/admin/team', element: <AdminTeam /> },
  { path: '/admin/concerns', element: <AdminConcerns /> },
  { path: '/admin/performance', element: <AdminPerformance /> },
]

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* The kiosk needs no login — the registered device token is its credential. */}
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Gate>
                <AppShell />
              </Gate>
            }
          >
            <Route path="/" element={<RoleHome />} />
            <Route path="/leave" element={<EmployeeLeave />} />
            <Route path="/tasks" element={<EmployeeTasks />} />
            <Route path="/log" element={<EmployeeDailyLog />} />
            <Route path="/concerns" element={<Concerns />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            {adminRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={<AdminOnly>{r.element}</AdminOnly>} />
            ))}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
