import type { KeyboardEvent, MouseEvent } from 'react'
import { cx, folderLabel, formatBytes, formatDate } from '../../lib'
import type { DriveItem } from '../../types'
import Menu from '../ui/Menu'
import { itemIcon, menuItems, type ItemActions } from './itemActions'

type RowProps = ItemActions & {
  item: DriveItem
  selected: boolean
  showLocation: boolean
  canSelect: boolean
  onSelect: (item: DriveItem, e: MouseEvent) => void
  onToggle: (item: DriveItem) => void
}

/** One row of the list view. Click selects, double click (or Enter) opens. */
export default function FileRow({ item, selected, showLocation, canSelect, onSelect, onToggle, ...actions }: RowProps) {
  const icon = itemIcon(item)

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={0}
      onClick={(e) => onSelect(item, e)}
      onDoubleClick={() => actions.onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') actions.onOpen(item)
        if (e.key === ' ' && canSelect) {
          e.preventDefault()
          onToggle(item)
        }
      }}
      className={cx(
        'group grid items-center gap-4 h-12 px-4 sm:px-6 border-b border-line-soft cursor-default select-none outline-none transition-colors',
        showLocation ? 'grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_200px_140px_100px_40px]' : 'grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_140px_100px_40px]',
        selected ? 'bg-selected' : 'hover:bg-hover focus-visible:bg-hover',
      )}
    >
      <div className="flex items-center gap-4 min-w-0" role="gridcell">
        {canSelect ? (
          <button
            aria-label={selected ? `Deselect ${item.name}` : `Select ${item.name}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggle(item)
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="relative w-6 h-6 -ml-1 flex items-center justify-center shrink-0"
          >
            <span className={cx('icon text-[22px] absolute transition-opacity', icon.className, selected ? 'opacity-0' : 'group-hover:opacity-0')}>
              {icon.icon}
            </span>
            <span className={cx('icon text-[20px] absolute transition-opacity text-primary', selected ? 'opacity-100 filled' : 'opacity-0 group-hover:opacity-100 text-ink-2')}>
              {selected ? 'check_box' : 'check_box_outline_blank'}
            </span>
          </button>
        ) : (
          <span className={cx('icon text-[22px]', icon.className)}>{icon.icon}</span>
        )}
        <span className="truncate text-sm text-ink font-medium" title={item.name}>
          {item.name}
        </span>
      </div>

      {showLocation && (
        <button
          role="gridcell"
          className="hidden md:flex items-center gap-2 min-w-0 h-8 px-2 -mx-2 rounded-full text-left text-sm text-ink-2 hover:bg-press"
          onClick={(e) => {
            e.stopPropagation()
            actions.onOpenLocation?.(item)
          }}
          title={folderLabel(item.location ?? '')}
        >
          <span className="icon text-[18px] file-folder filled">folder</span>
          <span className="truncate">{folderLabel(item.location ?? '')}</span>
        </button>
      )}
      <span role="gridcell" className="hidden md:block text-sm text-ink-2 truncate">
        {item.kind === 'file' ? formatDate(item.lastModified) : '—'}
      </span>
      <span role="gridcell" className="hidden md:block text-sm text-ink-2 truncate">
        {item.kind === 'file' ? formatBytes(item.size) : '—'}
      </span>
      <div role="gridcell" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <Menu
          trigger={({ toggle, open }) => (
            <button
              onClick={toggle}
              aria-label={`More actions for ${item.name}`}
              className={cx(
                'w-8 h-8 rounded-full flex items-center justify-center text-ink-2 hover:bg-press',
                open ? 'opacity-100 bg-press' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100',
              )}
            >
              <span className="icon">more_vert</span>
            </button>
          )}
          items={menuItems(item, actions)}
        />
      </div>
    </div>
  )
}

type CardProps = RowProps

/** Grid-view card: folders are compact pills, files get a large icon preview. */
export function FileCard({ item, selected, canSelect, onSelect, onToggle, ...actions }: CardProps) {
  const icon = itemIcon(item)
  const menu = (
    <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <Menu
        trigger={({ toggle }) => (
          <button onClick={toggle} aria-label={`More actions for ${item.name}`} className="w-8 h-8 rounded-full flex items-center justify-center text-ink-2 hover:bg-press">
            <span className="icon">more_vert</span>
          </button>
        )}
        items={menuItems(item, actions)}
      />
    </div>
  )

  const common = {
    role: 'gridcell' as const,
    'aria-selected': selected,
    tabIndex: 0,
    onClick: (e: MouseEvent) => onSelect(item, e),
    onDoubleClick: () => actions.onOpen(item),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') actions.onOpen(item)
      if (e.key === ' ' && canSelect) {
        e.preventDefault()
        onToggle(item)
      }
    },
  }

  if (item.kind === 'folder') {
    return (
      <div
        {...common}
        className={cx(
          'h-12 rounded-xl flex items-center gap-3 pl-4 pr-1 cursor-default select-none outline-none transition-colors',
          selected ? 'bg-selected' : 'bg-raised hover:bg-press focus-visible:bg-press',
        )}
      >
        <span className={cx('icon text-[22px]', icon.className)}>{icon.icon}</span>
        <span className="flex-1 truncate text-sm font-medium text-ink" title={item.name}>
          {item.name}
        </span>
        {menu}
      </div>
    )
  }

  return (
    <div
      {...common}
      className={cx(
        'rounded-xl p-2 pt-1 cursor-default select-none outline-none transition-colors',
        selected ? 'bg-selected' : 'bg-raised hover:bg-press focus-visible:bg-press',
      )}
    >
      <div className="flex items-center gap-3 h-10 pl-2">
        <span className={cx('icon text-[20px]', icon.className)}>{icon.icon}</span>
        <span className="flex-1 truncate text-sm font-medium text-ink" title={item.name}>
          {item.name}
        </span>
        {menu}
      </div>
      <div className="h-[140px] rounded-lg bg-surface flex items-center justify-center">
        <span className={cx('icon text-[64px] opacity-90', icon.className)}>{icon.icon}</span>
      </div>
      <div className="px-2 pt-2 text-xs text-ink-2 flex justify-between gap-2">
        <span>{formatBytes(item.size)}</span>
        <span>{formatDate(item.lastModified)}</span>
      </div>
    </div>
  )
}
