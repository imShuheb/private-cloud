import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../../lib'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: 'sm' | 'md' | 'lg'
}

const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }

/** Dialog with Escape-to-close, focus moved inside on open and returned on close. */
export default function Modal({ open, onClose, title, children, footer, width = 'md' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')
    ;(first ?? panel)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 anim-fade" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx('relative w-full bg-surface rounded-[28px] shadow-raised anim-pop max-h-[90vh] flex flex-col outline-none', widths[width])}
      >
        <div className="px-6 pt-6 pb-2 flex items-start justify-between gap-4">
          <h2 className="text-[22px] leading-7 text-ink">{title}</h2>
          <button
            data-close
            className="-mr-2 -mt-1 w-9 h-9 rounded-full flex items-center justify-center text-ink-2 hover:bg-hover"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="icon">close</span>
          </button>
        </div>
        <div className="px-6 py-2 overflow-y-auto scroll-thin">{children}</div>
        {footer && <div className="px-6 pt-4 pb-6 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
