import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import AppShell from './layouts/AppShell'
import EmployeeHome from './pages/employee/Home'
import EmployeeLeave from './pages/employee/Leave'
import EmployeeTasks from './pages/employee/Tasks'
import EmployeeDailyLog from './pages/employee/DailyLog'
import NotesPage from './pages/shared/Notes'
import AnnouncementsPage from './pages/shared/Announcements'
import AdminHome from './pages/admin/Home'
import AdminAttendance from './pages/admin/Attendance'
import AdminLeave from './pages/admin/Leave'
import AdminTasks from './pages/admin/Tasks'
import AdminLogs from './pages/admin/Logs'

function Gate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-stone-600">Loading…</div>
  }
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
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
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route
              path="/admin/attendance"
              element={
                <AdminOnly>
                  <AdminAttendance />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/leave"
              element={
                <AdminOnly>
                  <AdminLeave />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/tasks"
              element={
                <AdminOnly>
                  <AdminTasks />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <AdminOnly>
                  <AdminLogs />
                </AdminOnly>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
