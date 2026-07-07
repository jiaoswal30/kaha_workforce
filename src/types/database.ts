export type Role = 'admin' | 'employee'
export type WeekdayName = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
export type AttendanceStatus = 'present' | 'half_day' | 'absent' | 'week_off' | 'paid_leave' | 'unpaid_leave'
export type LeaveType = 'paid_leave' | 'unpaid_leave'
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected'
export type TodoStatus = 'pending' | 'in_progress' | 'done'

export interface Employee {
  id: string
  name: string
  email: string
  role: Role
  weekly_off_day: WeekdayName | null
  created_at: string
}

export interface Attendance {
  id: string
  employee_id: string
  date: string
  check_in_time: string | null
  check_in_lat: number | null
  check_in_lng: number | null
  check_out_time: string | null
  check_out_lat: number | null
  check_out_lng: number | null
  is_late: boolean
  is_half_day: boolean
  status: AttendanceStatus | null
  created_at: string
}

export interface LeaveBalance {
  id: string
  employee_id: string
  month: number
  year: number
  paid_leaves_entitled: number
  paid_leaves_used: number
  carried_deduction: number
  fifth_week_off_consumed: boolean
  deficit_carried_to_next_month: number
  notes: string | null
  created_at: string
}

export interface LeaveRequest {
  id: string
  employee_id: string
  requested_date: string
  leave_type: LeaveType
  status: LeaveRequestStatus
  admin_note: string | null
  created_at: string
}

export interface Todo {
  id: string
  employee_id: string
  date: string
  title: string
  description: string | null
  status: TodoStatus
  completed_at: string | null
  carried_from: string | null
  carried: boolean
  admin_comment: string | null
  created_at: string
}

export interface WeeklyGoal {
  id: string
  employee_id: string
  week_start: string
  title: string
  is_completed: boolean
  created_at: string
}

export interface DailyLog {
  id: string
  employee_id: string
  date: string
  customers_handled: number | null
  key_activities: string | null
  sales_notes: string | null
  issues: string | null
  created_at: string
}

export interface InventoryNote {
  id: string
  employee_id: string
  note: string
  is_resolved: boolean
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string | null
  created_by: string | null
  created_at: string
}

export interface AnnouncementRead {
  id: string
  announcement_id: string
  employee_id: string
  read_at: string
}

export interface StoreConfig {
  id: string
  store_name: string
  latitude: number
  longitude: number
  radius_meters: number
  weekday_open_time: string
  sunday_open_time: string
  late_threshold_minutes: number
}

