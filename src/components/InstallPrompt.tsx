import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'kaha_install_dismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * "Install the app" banner. On Android/desktop Chrome it triggers the real
 * install dialog; on iOS (where that API doesn't exist) it shows the
 * Add-to-Home-Screen steps. Hidden once installed or dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dismissed || isStandalone()) return null
  const ios = isIOS()
  if (!deferred && !ios) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') setDismissed(true)
      setDeferred(null)
    } else {
      setShowIOSHelp(true)
    }
  }

  return (
    <div className="rounded-xl border border-gold-400 bg-gold-tint p-3.5 lg:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <button onClick={install} className="flex flex-1 items-center gap-2.5 text-left">
          <Download size={18} strokeWidth={1.5} className="shrink-0 text-gold-600" />
          <span className="text-sm font-medium text-gold-600">
            Install the Kaha app on this phone — one tap, no link needed again
          </span>
        </button>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-ink-soft">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
      {showIOSHelp && (
        <ol className="mt-2.5 list-decimal space-y-1 border-t border-gold-400/30 pt-2.5 pl-5 text-xs text-ink dark:text-ivory-dark-text">
          <li>Tap the <strong>Share</strong> button (square with an arrow) in Safari's toolbar</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
          <li>Tap <strong>Add</strong> — the Kaha icon appears like any app</li>
        </ol>
      )}
    </div>
  )
}
