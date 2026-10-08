import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage, getConnections, switchConnection } from '../api'
import { permissionsOf, useUser } from '../context/auth'
import { useToast } from '../context/toast'
import { useActiveConnection } from '../hooks/useActiveConnection'
import { useDismiss } from '../hooks/useDismiss'
import { cx } from '../lib'
import type { ConnectionsList } from '../types'
import { Spinner } from './ui/Button'

/** Shows the active storage; users who manage connections can switch from here. */
export default function ConnectionSwitcher() {
  const user = useUser()
  const canManage = permissionsOf(user).canManageConnections
  const active = useActiveConnection()
  const navigate = useNavigate()
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [list, setList] = useState<ConnectionsList | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  if (active === undefined || active === null) return null

  async function toggle() {
    if (!canManage) return
    const next = !open
    setOpen(next)
    if (next) {
      try {
        setList(await getConnections())
      } catch (err) {
        toast.error(errorMessage(err, 'Could not load connections'))
      }
    }
  }

  async function select(id: string) {
    if (id === active?.id) return close()
    setSwitching(id)
    try {
      await switchConnection(id)
      // Every page caches data for the old bucket; a reload is the simplest way to start clean
      window.location.assign('/drive')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not switch storage'))
      setSwitching(null)
    }
  }

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        onClick={toggle}
        className={cx(
          'h-10 pl-3 pr-2 rounded-full flex items-center gap-2 text-sm text-ink-2 max-w-[240px]',
          canManage ? 'hover:bg-hover' : 'cursor-default',
        )}
        title={`${active.name} · ${active.bucket}`}
      >
        <span className="icon text-[20px] text-success">database</span>
        <span className="truncate">{active.name}</span>
        {canManage && <span className={cx('icon text-[20px] transition-transform', open && 'rotate-180')}>arrow_drop_down</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-surface rounded-lg shadow-menu py-2 z-[120] anim-pop origin-top-right">
          <div className="px-4 py-2 text-xs font-medium text-ink-3">Storage connections</div>
          {!list ? (
            <div className="px-4 py-3 flex items-center gap-2 text-sm text-ink-2">
              <Spinner small /> Loading…
            </div>
          ) : (
            list.connections.map((c) => (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                disabled={!!switching}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-hover disabled:opacity-60"
              >
                <span className={cx('icon text-[20px]', c.id === list.activeId ? 'text-primary filled' : 'text-ink-3')}>
                  {c.id === list.activeId ? 'radio_button_checked' : 'radio_button_unchecked'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink truncate">{c.name}</span>
                  <span className="block text-xs text-ink-3 truncate">{c.bucket}</span>
                </span>
                {switching === c.id && <Spinner small className="text-primary" />}
              </button>
            ))
          )}
          <div className="border-t border-line-soft mt-2 pt-2">
            <button
              className="w-full flex items-center gap-3 px-4 h-10 text-sm text-ink hover:bg-hover"
              onClick={() => {
                close()
                navigate('/connections')
              }}
            >
              <span className="icon text-[20px] text-ink-2">settings</span>
              Manage connections
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
