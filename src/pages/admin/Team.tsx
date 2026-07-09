import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { Card, SectionLabel, Button, Banner, Input, Chip, PageSkeleton, Select } from '../../components/ui'
import type { Employee, RegisteredDevice, StoreConfig, WeekdayName } from '../../types/database'

const DEVICE_TOKEN_KEY = 'kaha_device_token'
const WEEKDAYS: WeekdayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export default function AdminTeam() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [devices, setDevices] = useState<RegisteredDevice[]>([])
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [pinFor, setPinFor] = useState<Employee | null>(null)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinBusy, setPinBusy] = useState(false)

  const [deviceName, setDeviceName] = useState('')
  const [registering, setRegistering] = useState(false)

  const localToken = localStorage.getItem(DEVICE_TOKEN_KEY)

  const load = useCallback(async () => {
    const [{ data: emps }, { data: devs }, { data: cfg }] = await Promise.all([
      supabase.from('employees').select('*').eq('role', 'employee').order('name'),
      supabase.from('registered_devices').select('*').order('created_at', { ascending: false }),
      supabase.from('store_config').select('*').limit(1).maybeSingle(),
    ])
    setEmployees(emps ?? [])
    setDevices(devs ?? [])
    setConfig(cfg ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function savePin() {
    if (!pinFor) return
    setError(null)
    if (!/^\d{4}$/.test(pin1)) {
      setError('PIN must be exactly 4 digits.')
      return
    }
    if (pin1 !== pin2) {
      setError('PINs do not match.')
      return
    }
    setPinBusy(true)
    const { error } = await supabase.rpc('set_employee_pin', { p_employee_id: pinFor.id, p_pin: pin1 })
    setPinBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setNotice(`PIN updated for ${pinFor.name}.`)
    setPinFor(null)
    setPin1('')
    setPin2('')
    await load()
  }

  async function togglePhoto() {
    if (!config) return
    const next = !config.require_photo
    setConfig({ ...config, require_photo: next })
    const { error } = await supabase.rpc('set_require_photo', { p_value: next })
    if (error) {
      setError(error.message)
      setConfig({ ...config, require_photo: !next })
    }
  }

  async function registerThisComputer() {
    setError(null)
    if (!deviceName.trim()) {
      setError('Give this computer a name first (e.g. "Front desk PC").')
      return
    }
    setRegistering(true)
    const { data, error } = await supabase.rpc('register_device', { p_name: deviceName.trim() })
    setRegistering(false)
    if (error) {
      setError(error.message)
      return
    }
    const device = data as RegisteredDevice
    localStorage.setItem(DEVICE_TOKEN_KEY, device.device_token)
    setDeviceName('')
    setNotice(`This computer is now registered as "${device.name}". Open /kiosk on it for attendance.`)
    await load()
  }

  async function revoke(device: RegisteredDevice) {
    await supabase.rpc('revoke_device', { p_device_id: device.id })
    if (localToken === device.device_token) localStorage.removeItem(DEVICE_TOKEN_KEY)
    await load()
  }

  async function changeWeeklyOff(emp: Employee, day: WeekdayName) {
    await supabase.from('employees').update({ weekly_off_day: day }).eq('id', emp.id)
    await load()
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-ink dark:text-ivory-dark-text">Team</h1>
      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}

      <Card>
        <SectionLabel>Employees</SectionLabel>
        <ul className="divide-y divide-hairline dark:divide-hairline-dark">
          {employees.map((emp) => (
            <li key={emp.id} className="py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink dark:text-ivory-dark-text">{emp.name}</p>
                  <p className="truncate text-xs text-ink-soft">{emp.email}</p>
                </div>
                {emp.pin_hash ? <Chip tone="sage">PIN set</Chip> : <Chip tone="bronze">No PIN — kiosk blocked</Chip>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Select
                  value={emp.weekly_off_day ?? ''}
                  onChange={(e) => changeWeeklyOff(emp, e.target.value as WeekdayName)}
                  className="!w-auto flex-1 !py-1.5 text-xs capitalize"
                >
                  <option value="" disabled>Week off day</option>
                  {WEEKDAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </Select>
                <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setPinFor(emp)}>
                  {emp.pin_hash ? 'Change PIN' : 'Set PIN'}
                </Button>
              </div>
            </li>
          ))}
          {employees.length === 0 && <p className="py-3 text-sm text-ink-soft">No employees yet.</p>}
        </ul>
        <p className="mt-3 border-t border-hairline pt-3 text-xs text-ink-soft dark:border-hairline-dark">
          Accounts are created in the Supabase dashboard (Authentication → Add user, with name/role metadata). Only you can
          set or change PINs — employees cannot.
        </p>
      </Card>

      <Card>
        <SectionLabel>Kiosk settings</SectionLabel>

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">Require photo at check-in</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              Turn off if the kiosk computer has no camera — attendance becomes PIN-only. Applies immediately.
            </p>
          </div>
          <button
            onClick={togglePhoto}
            role="switch"
            aria-checked={config?.require_photo ?? false}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              config?.require_photo ? 'bg-gold-500' : 'bg-hairline dark:bg-hairline-dark'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] ${
                config?.require_photo ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div className="mt-5 border-t border-hairline pt-4 dark:border-hairline-dark">
          <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">Registered computers</p>
          <p className="mt-0.5 text-xs text-ink-soft">The attendance kiosk only works on computers listed here.</p>

          <ul className="mt-3 space-y-2">
            {devices.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl border border-hairline px-3.5 py-2.5 dark:border-hairline-dark"
              >
                <div>
                  <p className="text-sm text-ink dark:text-ivory-dark-text">
                    {d.name}
                    {localToken === d.device_token && <span className="ml-2 text-xs text-gold-600">this computer</span>}
                  </p>
                  <p className="text-xs text-ink-soft">Added {format(new Date(d.created_at), 'd MMM yyyy')}</p>
                </div>
                {d.is_active ? (
                  <Button variant="ghost" className="!px-2 !py-1 text-xs text-brick-500" onClick={() => revoke(d)}>
                    Revoke
                  </Button>
                ) : (
                  <Chip tone="neutral">Revoked</Chip>
                )}
              </li>
            ))}
            {devices.length === 0 && <p className="text-sm text-ink-soft">No computers registered yet.</p>}
          </ul>

          <div className="mt-3 flex gap-2">
            <Input
              placeholder='Name, e.g. "Front desk PC"'
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="!py-2 text-sm"
            />
            <Button busy={registering} onClick={registerThisComputer} className="whitespace-nowrap !py-2 text-xs">
              Register this computer
            </Button>
          </div>
        </div>
      </Card>

      {pinFor && (
        <div className="fixed inset-0 z-30 flex items-center justify-center px-6" onClick={() => setPinFor(null)}>
          <div className="absolute inset-0 bg-ink/30" />
          <div
            className="page-enter relative w-full max-w-sm rounded-[14px] border border-hairline bg-white p-5 dark:border-hairline-dark dark:bg-espresso-2"
            onClick={(e) => e.stopPropagation()}
          >
            <SectionLabel>Set PIN — {pinFor.name}</SectionLabel>
            <div className="space-y-3">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="4-digit PIN"
                value={pin1}
                onChange={(e) => setPin1(e.target.value.replace(/\D/g, ''))}
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="Repeat PIN"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
              />
              <div className="flex gap-2">
                <Button busy={pinBusy} onClick={savePin} className="flex-1">Save PIN</Button>
                <Button variant="ghost" onClick={() => setPinFor(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
