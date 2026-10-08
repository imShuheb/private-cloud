import { NavLink } from 'react-router-dom'
import { permissionsOf, useUser } from '../../context/auth'
import { cx, formatBytes, formatCount, relativeTime } from '../../lib'
import type { DriveStats } from '../../types'

type Props = {
  open: boolean
  onClose: () => void
  onNew?: () => void
  newDisabled?: boolean
  stats: DriveStats | null
}

export default function Sidebar({ open, onClose, onNew, newDisabled, stats }: Props) {
  const user = useUser()
  const perms = permissionsOf(user)

  const nav = [
    perms.canRead && { to: '/drive', icon: 'hard_drive', label: 'My Drive' },
    perms.canRead && { to: '/storage', icon: 'data_usage', label: 'Storage insights' },
    perms.canManageConnections && { to: '/connections', icon: 'hub', label: 'Connections' },
    perms.canManageSettings && { to: '/settings', icon: 'settings', label: 'Settings' },
  ].filter(Boolean) as Array<{ to: string; icon: string; label: string }>

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-[90] lg:hidden anim-fade" onClick={onClose} />}
      <aside
        className={cx(
          'w-64 shrink-0 flex flex-col pb-4 bg-app',
          'fixed lg:static inset-y-0 left-0 z-[100] lg:z-auto transition-transform duration-200 lg:transition-none',
          open ? 'translate-x-0 shadow-raised lg:shadow-none' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="h-16 lg:h-0" />
        <div className="px-4 pt-2 pb-4">
          <button
            onClick={() => {
              onNew?.()
              onClose()
            }}
            disabled={!onNew || newDisabled}
            className="h-14 pl-4 pr-6 rounded-2xl bg-surface shadow-card hover:shadow-raised hover:bg-[#edf2fc] inline-flex items-center gap-3 font-display font-medium text-ink transition-[box-shadow,background-color] disabled:opacity-50 disabled:shadow-none disabled:pointer-events-none"
          >
            <span className="icon text-[24px]">add</span>
            New
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scroll-thin">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-4 h-8 pl-4 pr-3 rounded-full text-sm transition-colors',
                  isActive ? 'bg-primary-soft text-on-primary-soft font-medium' : 'text-ink hover:bg-hover',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('icon text-[20px]', isActive && 'filled')}>{item.icon}</span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {perms.canRead && <StorageMeter stats={stats} />}
      </aside>
    </>
  )
}

function StorageMeter({ stats }: { stats: DriveStats | null }) {
  const scanning = !!stats?.scanning && !stats?.scannedAt
  return (
    <NavLink to="/storage" className="mx-3 mt-4 px-4 py-3 rounded-2xl hover:bg-hover block">
      <div className="flex items-center gap-3 text-sm text-ink mb-2">
        <span className="icon text-[20px] text-ink-2">cloud</span>
        Storage
      </div>
      {scanning && (
        <div className="h-1 rounded-full bg-line-soft overflow-hidden mb-2">
          <div className="h-full rounded-full progress-indeterminate" />
        </div>
      )}
      <div className="text-xs text-ink-2">
        {!stats ? (
          'Loading…'
        ) : scanning ? (
          'Calculating usage…'
        ) : (
          <>
            {formatBytes(stats.totalSize)} used · {formatCount(stats.totalFiles)} files
            <div className="text-ink-3 mt-0.5">Updated {relativeTime(stats.scannedAt)}</div>
          </>
        )}
      </div>
    </NavLink>
  )
}
