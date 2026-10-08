import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '../../hooks/useDismiss'
import { cx } from '../../lib'

export type MenuItem =
  | { label: string; icon?: string; onSelect: () => void; danger?: boolean; checked?: boolean; disabled?: boolean }
  | 'divider'

type Props = {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  header?: ReactNode
}

const GAP = 4
const EDGE = 8

/**
 * Dropdown rendered in a portal with fixed positioning, so it is never clipped by a scrolling
 * list; it opens upward when there's no room below and closes when the page scrolls.
 */
export default function Menu({ trigger, items, align = 'right', header }: Props) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const anchorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss([anchorRef, menuRef], open, close)

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!anchor || !menu) return
    const height = menu.offsetHeight
    const width = menu.offsetWidth
    const below = anchor.bottom + GAP
    const top = below + height > window.innerHeight - EDGE && anchor.top - GAP - height > EDGE ? anchor.top - GAP - height : below
    let left = align === 'right' ? anchor.right - width : anchor.left
    left = Math.min(Math.max(EDGE, left), window.innerWidth - width - EDGE)
    setStyle({ top: Math.max(EDGE, top), left })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return
      close()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open, close])

  return (
    <div ref={anchorRef} className="relative inline-flex">
      {trigger({
        open,
        toggle: () => {
          // Hidden until the layout effect has measured and placed it
          if (!open) setStyle({ visibility: 'hidden' })
          setOpen(!open)
        },
      })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={style}
            className="fixed min-w-[220px] max-w-[320px] max-h-[calc(100vh-16px)] overflow-y-auto bg-surface rounded-lg shadow-menu py-2 z-[160] anim-pop"
          >
            {header}
            {items.map((item, i) =>
              item === 'divider' ? (
                <div key={i} className="my-2 border-t border-line-soft" />
              ) : (
                <button
                  key={item.label}
                  role="menuitem"
                  disabled={item.disabled}
                  className={cx(
                    'w-full flex items-center gap-3 h-10 px-4 text-sm text-left hover:bg-hover disabled:opacity-40 disabled:pointer-events-none',
                    item.danger ? 'text-danger' : 'text-ink',
                  )}
                  onClick={() => {
                    close()
                    item.onSelect()
                  }}
                >
                  {item.icon && <span className={cx('icon text-[20px]', item.danger ? 'text-danger' : 'text-ink-2')}>{item.icon}</span>}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.checked && <span className="icon text-[18px] text-primary">check</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
