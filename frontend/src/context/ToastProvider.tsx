import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../lib'
import { ToastContext, type ToastOptions } from './toast'

type Toast = ToastOptions & { id: number; message: string }

/** Drive-style snackbars, bottom left, one at a time with a short queue. */
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, options: ToastOptions = {}) => {
    const id = nextId.current++
    setToasts((list) => [...list.slice(-2), { ...options, id, message }])
  }, [])

  const api = useMemo(() => ({ show, error: (message: string) => show(message, { tone: 'error' }) }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 left-4 right-4 sm:right-auto z-[200] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs ?? (toast.tone === 'error' ? 7000 : 4500))
    return () => window.clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className="anim-slide-up pointer-events-auto flex items-center gap-3 min-w-[280px] max-w-[560px] rounded-lg bg-[#303030] text-[#f2f2f2] pl-4 pr-2 py-2.5 shadow-raised text-sm"
    >
      {toast.tone === 'error' && <span className="icon text-[#f2b8b5] text-[20px]">error</span>}
      {toast.tone === 'success' && <span className="icon text-[#6dd58c] text-[20px]">check_circle</span>}
      <span className="flex-1 py-1 leading-snug">{toast.message}</span>
      {toast.action && (
        <button
          className="px-3 py-1.5 rounded-full text-[#a8c7fa] font-medium hover:bg-white/10"
          onClick={() => {
            toast.action?.onClick()
            onDismiss(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        className={cx('w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10')}
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        <span className="icon text-[18px]">close</span>
      </button>
    </div>
  )
}
