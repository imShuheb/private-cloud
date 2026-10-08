import type { KeyboardEvent, MouseEvent } from 'react'
import { cx, folderLabel, formatBytes, formatDate } from '../../lib'
import type { DriveItem } from '../../types'
import Menu from '../ui/Menu'
import { itemIcon, listColumns, menuItems, type ItemActions } from './itemActions'

type RowProps = ItemActions & {
  item: DriveItem
  selected: boolean
  /** Something is selected, so every row shows its checkbox. */
  selectionMode: boolean
  showLocation: boolean
  canSelect: boolean
  onSelect: (item: DriveItem, e: MouseEvent) => void
  onToggle: (item: DriveItem) => void
}

function keyHandler(item: DriveItem, canSelect: boolean, onToggle: (i: DriveItem) => void, onOpen: (i: DriveItem) => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter') onOpen(item)
    if (e.key === ' ' && canSelect) {
      e.preventDefault()
      onToggle(item)
    }
  }
}

/** Checkbox over the item icon: shown on hover, on touch screens, and whenever anything is selected. */
function SelectBox({ item, selected, selectionMode, onToggle, iconClass, icon }: { item: DriveItem; selected: boolean; selectionMode: boolean; onToggle: (i: DriveItem) => void; iconClass: string; icon: string }) {
  const showBox = selected || selectionMode
  return (
    <button
      aria-label={selected ? `Deselect ${item.name}` : `Select ${item.name}`}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(item)
      }}
      className="relative w-8 h-8 -ml-1.5 rounded-full flex items-center justify-center shrink-0 hover:bg-press"
    >
      <span
        className={cx(
          'icon text-[22px] absolute transition-opacity',
          iconClass,
          showBox ? 'opacity-0' : 'group-hover:opacity-0 [@media(hover:none)]:opacity-0',
        )}
      >
        {icon}
      </span>
      <span
        className={cx(
          'icon text-[22px] absolute transition-opacity',
          selected ? 'filled text-primary opacity-100' : 'text-ink-2',
          !selected && (showBox ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'),
        )}
      >
        {selected ? 'check_box' : 'check_box_outline_blank'}
      </span>
    </button>
  )
}

function RowMenu({ item, actions, className }: { item: DriveItem; actions: ItemActions; className?: string }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className={className}>
      <Menu
        trigger={({ toggle, open }) => (
          <button
            onClick={toggle}
            aria-label={`More actions for ${item.name}`}
            className={cx(
              'w-8 h-8 rounded-full flex items-center justify-center text-ink-2 hover:bg-press',
              open ? 'bg-press' : 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
            )}
          >
            <span className="icon">more_vert</span>
          </button>
        )}
        items={menuItems(item, actions)}
      />
    </div>
  )
}

/** One row of the list view. Click (or Enter) opens; the checkbox (or Space) selects. */
export default function FileRow({ item, selected, selectionMode, showLocation, canSelect, onSelect, onToggle, ...actions }: RowProps) {
  const icon = itemIcon(item)
  const details = item.kind === 'file' ? `${formatBytes(item.size)} · ${formatDate(item.lastModified)}` : 'Folder'

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={0}
      onClick={(e) => onSelect(item, e)}
      onKeyDown={keyHandler(item, canSelect, onToggle, actions.onOpen)}
      className={cx(
        'group grid items-center gap-4 min-h-12 py-1 px-4 sm:px-6 border-b border-line-soft cursor-default select-none outline-none transition-colors',
        listColumns(showLocation),
        selected ? 'bg-selected' : 'hover:bg-hover focus-visible:bg-hover',
      )}
    >
      <div className="flex items-center gap-3 min-w-0" role="gridcell">
        {canSelect ? (
          <SelectBox item={item} selected={selected} selectionMode={selectionMode} onToggle={onToggle} iconClass={icon.className} icon={icon.icon} />
        ) : (
          <span className={cx('icon text-[22px] w-8 -ml-1.5 text-center', icon.className)}>{icon.icon}</span>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm text-ink font-medium" title={item.name}>
            {item.name}
          </div>
          <div className="md:hidden text-xs text-ink-3 truncate">
            {details}
            {showLocation && ` · ${folderLabel(item.location ?? '')}`}
          </div>
        </div>
      </div>

      {showLocation && (
        <button
          role="gridcell"
          className="hidden md:flex items-center gap-2 min-w-0 h-8 px-2 -mx-2 rounded-full text-left text-sm text-ink-2 hover:bg-press"
          onClick={(e) => {
            e.stopPropagation()
            actions.onOpenLocation?.(item)
          }}
          title={`Open ${folderLabel(item.location ?? '')}`}
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
      <RowMenu item={item} actions={actions} className="justify-self-end" />
    </div>
  )
}

/** Grid-view card: folders are compact pills, files get a large icon preview. */
export function FileCard({ item, selected, selectionMode, canSelect, onSelect, onToggle, ...actions }: RowProps) {
  const icon = itemIcon(item)
  const common = {
    role: 'gridcell' as const,
    'aria-selected': selected,
    tabIndex: 0,
    onClick: (e: MouseEvent) => onSelect(item, e),
    onKeyDown: keyHandler(item, canSelect, onToggle, actions.onOpen),
  }
  const box = canSelect ? (
    <SelectBox item={item} selected={selected} selectionMode={selectionMode} onToggle={onToggle} iconClass={icon.className} icon={icon.icon} />
  ) : (
    <span className={cx('icon text-[22px]', icon.className)}>{icon.icon}</span>
  )

  if (item.kind === 'folder') {
    return (
      <div
        {...common}
        className={cx(
          'group h-12 rounded-xl flex items-center gap-2 pl-3 pr-1 cursor-default select-none outline-none transition-colors',
          selected ? 'bg-selected' : 'bg-raised hover:bg-press focus-visible:bg-press',
        )}
      >
        {box}
        <span className="flex-1 truncate text-sm font-medium text-ink" title={item.name}>
          {item.name}
        </span>
        <RowMenu item={item} actions={actions} />
      </div>
    )
  }

  return (
    <div
      {...common}
      className={cx(
        'group rounded-xl p-2 pt-1 cursor-default select-none outline-none transition-colors',
        selected ? 'bg-selected' : 'bg-raised hover:bg-press focus-visible:bg-press',
      )}
    >
      <div className="flex items-center gap-2 h-10 pl-1.5">
        {box}
        <span className="flex-1 truncate text-sm font-medium text-ink" title={item.name}>
          {item.name}
        </span>
        <RowMenu item={item} actions={actions} />
      </div>
      <div className="h-[132px] rounded-lg bg-surface flex items-center justify-center">
        <span className={cx('icon text-[56px] opacity-90', icon.className)}>{icon.icon}</span>
      </div>
      <div className="px-1.5 pt-2 text-xs text-ink-2 flex justify-between gap-2">
        <span>{formatBytes(item.size)}</span>
        <span>{formatDate(item.lastModified)}</span>
      </div>
    </div>
  )
}
