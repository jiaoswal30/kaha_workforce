import { useState } from 'react'
import { X } from 'lucide-react'

/** Selfie thumbnail that enlarges in a modal on tap (admin attendance views). */
export default function PhotoThumb({ photo, label }: { photo: string | null; label: string }) {
  const [open, setOpen] = useState(false)
  if (!photo) return null
  return (
    <>
      <button onClick={() => setOpen(true)} title={label} className="shrink-0">
        <img src={photo} alt={label} className="h-9 w-9 rounded-lg border border-hairline object-cover dark:border-hairline-dark" />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-6" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-ink/60" />
          <div className="page-enter relative max-w-sm">
            <img src={photo} alt={label} className="w-full rounded-2xl" />
            <p className="mt-2 text-center text-sm text-white">{label}</p>
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-3 -right-3 rounded-full bg-white p-1.5 text-ink shadow"
              aria-label="Close"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
