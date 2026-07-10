import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabaseClient'
import { computeFaceDescriptor, preloadFaceModels } from '../../lib/face'
import { Card, SectionLabel, Button, Banner, Input, Chip, PageSkeleton, Select } from '../../components/ui'
import type { Employee, RegisteredDevice, StoreConfig, WeekdayName } from '../../types/database'

const DEVICE_TOKEN_KEY = 'kaha_device_token'
const WEEKDAYS: WeekdayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function Toggle({
  label,
  hint,
  checked,
  onToggle,
}: {
  label: string
  hint: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-ink dark:text-ivory-dark-text">{label}</p>
        <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={checked}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-gold-500' : 'bg-hairline dark:bg-hairline-dark'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-[left] ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

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
  const [faceFor, setFaceFor] = useState<Employee | null>(null)

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

  async function toggleTaskComments() {
    if (!config) return
    const next = !config.task_comments_enabled
    setConfig({ ...config, task_comments_enabled: next })
    const { error } = await supabase.from('store_config').update({ task_comments_enabled: next }).eq('id', config.id)
    if (error) {
      setError(error.message)
      setConfig({ ...config, task_comments_enabled: !next })
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
                <div className="flex shrink-0 gap-1.5">
                  {emp.pin_hash ? <Chip tone="sage">PIN set</Chip> : <Chip tone="bronze">No PIN</Chip>}
                  {config?.require_photo &&
                    (emp.face_descriptor ? <Chip tone="sage">Face enrolled</Chip> : <Chip tone="bronze">No face</Chip>)}
                </div>
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
                {config?.require_photo && (
                  <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => setFaceFor(emp)}>
                    {emp.face_descriptor ? 'Re-enroll face' : 'Enroll face'}
                  </Button>
                )}
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
        <SectionLabel>Preferences</SectionLabel>

        <Toggle
          label="Require photo at check-in"
          hint="Turn off if the kiosk computer has no camera — attendance becomes PIN-only. Applies immediately."
          checked={config?.require_photo ?? false}
          onToggle={togglePhoto}
        />
        <div className="mt-4">
          <Toggle
            label="Task comments"
            hint="Off: tasks just get added and ticked off — nothing for you to save or approve. On: you can leave a note on any employee task."
            checked={config?.task_comments_enabled ?? false}
            onToggle={toggleTaskComments}
          />
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
              placeholder='Nickname, e.g. "Store laptop"'
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="!py-2 text-sm"
            />
            <Button busy={registering} onClick={registerThisComputer} className="whitespace-nowrap !py-2 text-xs">
              Register this computer
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            The nickname is just a label so you can recognize the machine in the list above — type anything. Clicking the
            button trusts <em>the browser you're using right now</em>.
          </p>

          {localToken && (
            <a
              href="/kiosk"
              className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-gold-400 bg-gold-tint px-4 py-2.5 text-sm font-medium text-gold-600"
            >
              Open the attendance kiosk →
            </a>
          )}
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

      {faceFor && (
        <FaceEnrollModal
          employee={faceFor}
          onClose={() => setFaceFor(null)}
          onEnrolled={async () => {
            setFaceFor(null)
            setNotice(`Face enrolled for ${faceFor.name}. The kiosk will now verify it at every check-in.`)
            await load()
          }}
          onError={(m) => setError(m)}
        />
      )}
    </div>
  )
}

function FaceEnrollModal({
  employee,
  onClose,
  onEnrolled,
  onError,
}: {
  employee: Employee
  onClose: () => void
  onEnrolled: () => void
  onError: (message: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'working'>('idle')
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    preloadFaceModels()
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => setCameraError('Camera unavailable — check permissions on this computer.'))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function capture() {
    const video = videoRef.current
    if (!video) return
    setStatus('working')
    setHint(null)
    try {
      const descriptor = await computeFaceDescriptor(video)
      if (!descriptor) {
        setHint('No face detected — face the camera in good light and try again.')
        setStatus('idle')
        return
      }
      const { error } = await supabase.rpc('set_employee_face', {
        p_employee_id: employee.id,
        p_descriptor: descriptor,
      })
      if (error) {
        onError(error.message)
        setStatus('idle')
        return
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      onEnrolled()
    } catch {
      setHint('Face detection failed to run — try again.')
      setStatus('idle')
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center px-6" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30" />
      <div
        className="page-enter relative w-full max-w-sm rounded-[14px] border border-hairline bg-white p-5 dark:border-hairline-dark dark:bg-espresso-2"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionLabel>Enroll face — {employee.name}</SectionLabel>
        <p className="mb-3 text-xs text-ink-soft">
          Have {employee.name.split(' ')[0]} face the camera in good light, then capture. The kiosk will compare every
          future check-in against this.
        </p>
        {cameraError ? (
          <Banner tone="error">{cameraError}</Banner>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="mx-auto h-52 w-52 rounded-full border-2 border-gold-400 object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        )}
        {hint && <p className="mt-2 text-center text-xs text-bronze-500">{hint}</p>}
        <div className="mt-4 flex gap-2">
          <Button busy={status === 'working'} onClick={capture} className="flex-1" disabled={!!cameraError}>
            {status === 'working' ? 'Reading face…' : 'Capture & enroll'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
