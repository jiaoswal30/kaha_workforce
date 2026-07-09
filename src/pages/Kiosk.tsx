import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Delete } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import type { Attendance, KioskRosterEntry } from '../types/database'

const DEVICE_TOKEN_KEY = 'kaha_device_token'

type View =
  | { name: 'roster' }
  | { name: 'pin'; employee: KioskRosterEntry; error?: string }
  | { name: 'camera'; employee: KioskRosterEntry; pin: string }
  | { name: 'done'; message: string; note?: string }

export default function Kiosk() {
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY)
  const [roster, setRoster] = useState<KioskRosterEntry[] | null>(null)
  const [unregistered, setUnregistered] = useState(!deviceToken)
  const [view, setView] = useState<View>({ name: 'roster' })
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const loadRoster = useCallback(async () => {
    if (!deviceToken) return
    const { data, error } = await supabase.rpc('kiosk_roster', { p_device_token: deviceToken })
    if (error) {
      setUnregistered(true)
    } else {
      setUnregistered(false)
      setRoster(data ?? [])
    }
  }, [deviceToken])

  useEffect(() => {
    loadRoster()
    const t = setInterval(loadRoster, 60000)
    return () => clearInterval(t)
  }, [loadRoster])

  async function completeAction(employee: KioskRosterEntry, pin: string, photo: string | null) {
    const fn = employee.checked_in ? 'kiosk_check_out' : 'kiosk_check_in'
    const { data, error } = await supabase.rpc(fn, {
      p_device_token: deviceToken,
      p_employee_id: employee.employee_id,
      p_pin: pin,
      p_photo: photo,
    })
    if (error) {
      setView({ name: 'pin', employee, error: error.message })
      return
    }
    const row = data as Attendance
    const first = employee.name.split(' ')[0]
    if (employee.checked_in) {
      setView({ name: 'done', message: `Checked out — see you tomorrow, ${first}` })
    } else {
      setView({
        name: 'done',
        message: `Checked in ✦ ${format(new Date(row.check_in_time!), 'h:mm a')}`,
        note: row.is_half_day ? `Marked as half day (checked in after the grace window)` : undefined,
      })
    }
    await loadRoster()
  }

  async function onPinComplete(employee: KioskRosterEntry, pin: string) {
    if (!deviceToken) return
    const { error } = await supabase.rpc('kiosk_verify_pin', {
      p_device_token: deviceToken,
      p_employee_id: employee.employee_id,
      p_pin: pin,
    })
    if (error) {
      setView({ name: 'pin', employee, error: error.message })
      return
    }
    if (employee.require_photo) {
      setView({ name: 'camera', employee, pin })
    } else {
      await completeAction(employee, pin, null)
    }
  }

  if (unregistered) {
    return (
      <KioskFrame>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="font-display text-6xl text-ink dark:text-ivory-dark-text">K</span>
          <p className="mt-6 font-display text-xl text-ink dark:text-ivory-dark-text">
            This device is not registered for attendance
          </p>
          <p className="mt-2 max-w-xs text-sm text-ink-soft">
            Admin: sign in on this computer and register it from Team settings.
          </p>
        </div>
      </KioskFrame>
    )
  }

  return (
    <KioskFrame>
      {view.name === 'roster' && (
        <>
          <div className="mb-8 text-center">
            <p className="font-display text-2xl text-ink dark:text-ivory-dark-text">{format(clock, 'EEEE, d MMMM')}</p>
            <p className="mt-1 text-lg tabular-nums text-ink-soft">
              {format(clock, 'h:mm')}
              <span className="text-gold-500">{format(clock, ':ss')}</span>
              <span className="ml-1 text-sm">{format(clock, 'a')}</span>
            </p>
          </div>
          {roster === null ? (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-24 rounded-[14px]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {roster.map((emp) => (
                <button
                  key={emp.employee_id}
                  onClick={() => !emp.completed && setView({ name: 'pin', employee: emp })}
                  disabled={emp.completed}
                  className={`rounded-[14px] border p-4 text-left transition-colors ${
                    emp.completed
                      ? 'border-hairline bg-white opacity-55 dark:border-hairline-dark dark:bg-espresso-2'
                      : 'border-hairline bg-white hover:border-gold-400 dark:border-hairline-dark dark:bg-espresso-2'
                  }`}
                >
                  <p className="font-display text-lg text-ink dark:text-ivory-dark-text">{emp.name.split(' ')[0]}</p>
                  <p className={`mt-1 text-xs ${emp.checked_in ? 'text-gold-600' : 'text-ink-soft'}`}>
                    {emp.completed
                      ? `Done · ${format(new Date(emp.check_in_time!), 'h:mm a')} – ${format(new Date(emp.check_out_time!), 'h:mm a')}`
                      : emp.checked_in
                        ? `In since ${format(new Date(emp.check_in_time!), 'h:mm a')}`
                        : 'Not in yet'}
                  </p>
                </button>
              ))}
              {roster.length === 0 && <p className="col-span-2 text-center text-sm text-ink-soft">No employees yet.</p>}
            </div>
          )}
        </>
      )}

      {view.name === 'pin' && (
        <PinScreen
          key={view.error ?? 'fresh'}
          employee={view.employee}
          error={view.error}
          onCancel={() => setView({ name: 'roster' })}
          onComplete={(pin) => onPinComplete(view.employee, pin)}
        />
      )}

      {view.name === 'camera' && (
        <CameraScreen
          employee={view.employee}
          onCancel={() => setView({ name: 'roster' })}
          onCapture={(photo) => completeAction(view.employee, view.pin, photo)}
        />
      )}

      {view.name === 'done' && (
        <DoneScreen message={view.message} note={view.note} onDone={() => setView({ name: 'roster' })} />
      )}
    </KioskFrame>
  )
}

function KioskFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <div className="page-enter flex flex-1 flex-col">{children}</div>
      <p className="label-caps mt-10 text-center">Kaha ✦ Staff Attendance</p>
    </div>
  )
}

function PinScreen({
  employee,
  error,
  onCancel,
  onComplete,
}: {
  employee: KioskRosterEntry
  error?: string
  onCancel: () => void
  onComplete: (pin: string) => void
}) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const action = employee.checked_in ? 'check out' : 'check in'

  function press(d: string) {
    if (busy || pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      setBusy(true)
      onComplete(next)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <p className="font-display text-2xl text-ink dark:text-ivory-dark-text">Hi, {employee.name.split(' ')[0]}</p>
      <p className="mt-1 text-sm text-ink-soft">Enter your PIN to {action}</p>

      <div className={`mt-8 flex gap-4 ${error ? 'pin-shake' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border transition-colors ${
              i < pin.length ? 'border-gold-500 bg-gold-500' : 'border-hairline dark:border-hairline-dark'
            }`}
          />
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-brick-500">{error}</p>}

      <div className="mt-8 grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>{d}</Key>
        ))}
        <span />
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete">
          <Delete size={20} strokeWidth={1.5} className="mx-auto" />
        </Key>
      </div>

      <button onClick={onCancel} className="mt-8 text-sm text-ink-soft hover:text-ink dark:hover:text-ivory-dark-text">
        Cancel
      </button>
    </div>
  )
}

function Key({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="h-16 w-16 rounded-2xl border border-hairline bg-white text-xl font-medium text-ink transition-colors hover:border-gold-400 active:bg-gold-tint dark:border-hairline-dark dark:bg-espresso-2 dark:text-ivory-dark-text"
      {...props}
    >
      {children}
    </button>
  )
}

function CameraScreen({
  employee,
  onCancel,
  onCapture,
}: {
  employee: KioskRosterEntry
  onCancel: () => void
  onCapture: (photo: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const capturedRef = useRef(false)

  useEffect(() => {
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
        setCount(3)
      })
      .catch(() => setError('Camera is required for attendance — ask the admin, or check camera permissions.'))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    if (count === null) return
    if (count > 0) {
      const t = setTimeout(() => setCount(count - 1), 1000)
      return () => clearTimeout(t)
    }
    if (capturedRef.current) return
    capturedRef.current = true
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    const scale = 480 / video.videoWidth
    canvas.width = 480
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
    const photo = canvas.toDataURL('image/jpeg', 0.7)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    onCapture(photo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <p className="font-display text-2xl text-ink dark:text-ivory-dark-text">Hold still, {employee.name.split(' ')[0]}</p>
      <p className="mt-1 text-sm text-ink-soft">Photo confirms it's really you</p>

      {error ? (
        <div className="mt-8 max-w-xs rounded-xl border border-brick-500/25 bg-brick-tint px-4 py-3 text-center text-sm text-brick-500">
          {error}
        </div>
      ) : (
        <div className="relative mt-8">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-56 w-56 rounded-full border-2 border-gold-400 object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          {count !== null && count > 0 && (
            <span className="absolute inset-0 flex items-center justify-center font-display text-7xl text-white drop-shadow">
              {count}
            </span>
          )}
        </div>
      )}

      <button onClick={onCancel} className="mt-8 text-sm text-ink-soft hover:text-ink dark:hover:text-ivory-dark-text">
        Cancel
      </button>
    </div>
  )
}

function DoneScreen({ message, note, onDone }: { message: string; note?: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="34" fill="none" strokeWidth="1.5" className="stroke-gold-400" />
        <path
          d="M22 37 L32 47 L50 27"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="check-path stroke-gold-500"
        />
      </svg>
      <p className="mt-6 font-display text-2xl text-ink dark:text-ivory-dark-text">{message}</p>
      {note && <p className="mt-2 text-sm text-bronze-500">{note}</p>}
    </div>
  )
}
