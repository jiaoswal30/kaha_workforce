import { supabase } from './supabaseClient'

// Public VAPID key — safe to ship in the client; the private half lives only
// in the Supabase edge function's secrets.
const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ??
  'BGe8snp-qaKU2ozSlIPDqFwSN2OLVTLp634_Prflvd8wSzPcC3pZaikCWVmPPeQbA1_EK_yDaZmpmH8L-lHGV0I'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
}

/**
 * Full enrollment: permission → service worker → push subscription → saved
 * to the database so the edge function can send to this device.
 */
export async function enablePush(employeeId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) {
    return { ok: false, reason: 'This browser does not support push notifications. On iPhone: add the app to your Home Screen first (Share → Add to Home Screen), then try from there.' }
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notification permission was denied. Allow notifications for this site in browser settings.' }
  }
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { employee_id: employeeId, endpoint: sub.endpoint, subscription: json },
    { onConflict: 'endpoint' }
  )
  if (error) return { ok: false, reason: 'Could not save the subscription: ' + error.message }
  return { ok: true }
}

/** Keep the service worker registered on app load (harmless if already registered). */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
}
