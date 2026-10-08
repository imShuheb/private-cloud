import { createContext, useContext } from 'react'

export type ToastTone = 'info' | 'error' | 'success'

export type ToastOptions = {
  tone?: ToastTone
  action?: { label: string; onClick: () => void }
  durationMs?: number
}

export type ToastApi = {
  show: (message: string, options?: ToastOptions) => void
  error: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
