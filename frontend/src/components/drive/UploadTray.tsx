import { useState } from 'react'
import { cx, formatBytes, getFileIcon } from '../../lib'
import type { UploadItem } from '../../hooks/useUploads'

type Props = {
  items: UploadItem[]
  onCancel: (id: string) => void
  onCancelAll: () => void
  onClose: () => void
}

/** Drive-style upload panel, bottom right, collapsible. */
export default function UploadTray({ items, onCancel, onCancelAll, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  if (items.length === 0) return null

  const active = items.filter((u) => u.status === 'queued' || u.status === 'uploading').length
  const failed = items.filter((u) => u.status === 'error').length
  const done = items.filter((u) => u.status === 'done').length
  const title =
    active > 0
      ? `Uploading ${active} item${active === 1 ? '' : 's'}`
      : failed > 0
        ? `${failed} upload${failed === 1 ? '' : 's'} failed`
        : `${done} upload${done === 1 ? '' : 's'} complete`

  return (
    <section
      aria-label="Uploads"
      className="fixed bottom-0 right-0 sm:right-6 w-full sm:w-[360px] bg-surface rounded-t-2xl shadow-raised z-[140] anim-slide-up overflow-hidden"
    >
      <header className="flex items-center gap-1 h-14 pl-5 pr-2 bg-raised">
        <h2 className="flex-1 text-[15px] font-medium text-ink">{title}</h2>
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink-2 hover:bg-hover"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand' : 'Minimise'}
        >
          <span className={cx('icon transition-transform', collapsed && 'rotate-180')}>expand_more</span>
        </button>
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink-2 hover:bg-hover"
          onClick={() => {
            if (active > 0) onCancelAll()
            onClose()
          }}
          aria-label={active > 0 ? 'Cancel all uploads' : 'Close'}
          title={active > 0 ? 'Cancel all uploads' : 'Close'}
        >
          <span className="icon">close</span>
        </button>
      </header>

      {!collapsed && (
        <ul className="max-h-[300px] overflow-y-auto scroll-thin">
          {items.map((u) => {
            const icon = getFileIcon(u.name)
            return (
              <li key={u.id} className="group flex items-center gap-3 h-14 px-5 hover:bg-hover">
                <span className={cx('icon', icon.className)}>{icon.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink truncate" title={u.name}>
                    {u.name}
                  </div>
                  <div className={cx('text-xs truncate', u.status === 'error' ? 'text-danger' : 'text-ink-3')}>
                    {u.status === 'error'
                      ? u.error
                      : u.status === 'cancelled'
                        ? 'Cancelled'
                        : u.status === 'queued'
                          ? `Waiting · ${formatBytes(u.size)}`
                          : u.status === 'done'
                            ? formatBytes(u.size)
                            : `${u.progress}% of ${formatBytes(u.size)}`}
                  </div>
                </div>
                <StatusIcon item={u} onCancel={() => onCancel(u.id)} />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function StatusIcon({ item, onCancel }: { item: UploadItem; onCancel: () => void }) {
  if (item.status === 'done') return <span className="icon filled text-success">check_circle</span>
  if (item.status === 'error') return <span className="icon filled text-danger">error</span>
  if (item.status === 'cancelled') return <span className="icon text-ink-3">block</span>

  const r = 9
  const circumference = 2 * Math.PI * r
  return (
    <div className="relative w-8 h-8 flex items-center justify-center">
      <svg viewBox="0 0 24 24" className="w-6 h-6 -rotate-90 group-hover:opacity-0" aria-hidden>
        <circle cx="12" cy="12" r={r} fill="none" stroke="var(--color-line-soft)" strokeWidth="3" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - item.progress / 100)}
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <button
        onClick={onCancel}
        aria-label={`Cancel ${item.name}`}
        className="absolute inset-0 rounded-full flex items-center justify-center text-ink-2 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-press"
      >
        <span className="icon text-[20px]">close</span>
      </button>
    </div>
  )
}
