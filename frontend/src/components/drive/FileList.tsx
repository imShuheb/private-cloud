import { useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { cx, type SortDir, type SortField } from '../../lib'
import type { DriveItem } from '../../types'
import FileRow, { FileCard } from './FileRow'
import { listColumns, type ItemActions } from './itemActions'
import type { ViewMode } from './Toolbar'

type Props = ItemActions & {
  items: DriveItem[]
  view: ViewMode
  sortField: SortField
  sortDir: SortDir
  onSortChange: (field: SortField, dir: SortDir) => void
  selected: Set<string>
  onSelectionChange: (next: Set<string>) => void
  onDeleteSelected?: () => void
  canSelect: boolean
  showLocation: boolean
}

/**
 * List or grid with Drive-style selection: click, Ctrl/Cmd-click, Shift-click, Ctrl/Cmd+A,
 * Escape to clear and Delete/Backspace to delete the selection.
 */
export default function FileList({
  items,
  view,
  sortField,
  sortDir,
  onSortChange,
  selected,
  onSelectionChange,
  onDeleteSelected,
  canSelect,
  showLocation,
  ...actions
}: Props) {
  const anchor = useRef<string | null>(null)
  const selectionMode = selected.size > 0
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.key))

  function select(item: DriveItem, e: MouseEvent) {
    if (!canSelect) return
    const keys = items.map((i) => i.key)
    if (e.shiftKey && anchor.current && keys.includes(anchor.current)) {
      const [a, b] = [keys.indexOf(anchor.current), keys.indexOf(item.key)].sort((x, y) => x - y)
      onSelectionChange(new Set(keys.slice(a, b + 1)))
      return
    }
    anchor.current = item.key
    if (e.metaKey || e.ctrlKey || selectionMode) {
      // Once something is selected, a plain click adds or removes (handy on touch screens)
      toggle(item)
      return
    }
    onSelectionChange(new Set([item.key]))
  }

  function toggle(item: DriveItem) {
    if (!canSelect) return
    anchor.current = item.key
    const next = new Set(selected)
    if (next.has(item.key)) next.delete(item.key)
    else next.add(item.key)
    onSelectionChange(next)
  }

  function toggleAll() {
    onSelectionChange(allSelected ? new Set() : new Set(items.map((i) => i.key)))
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!canSelect) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      onSelectionChange(new Set(items.map((i) => i.key)))
    } else if (e.key === 'Escape' && selectionMode) {
      onSelectionChange(new Set())
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectionMode && onDeleteSelected) {
      e.preventDefault()
      onDeleteSelected()
    }
  }

  const rowProps = { canSelect, selectionMode, onSelect: select, onToggle: toggle, showLocation, ...actions }

  if (view === 'grid') {
    const folders = items.filter((i) => i.kind === 'folder')
    const files = items.filter((i) => i.kind === 'file')
    return (
      <div role="grid" aria-multiselectable={canSelect} onKeyDown={onKeyDown} className="px-4 sm:px-6 pt-2 pb-6 space-y-6">
        {folders.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-ink mb-3">Folders</h2>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
              {folders.map((item) => (
                <FileCard key={item.key} item={item} selected={selected.has(item.key)} {...rowProps} />
              ))}
            </div>
          </section>
        )}
        {files.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-ink mb-3">Files</h2>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
              {files.map((item) => (
                <FileCard key={item.key} item={item} selected={selected.has(item.key)} {...rowProps} />
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div role="grid" aria-multiselectable={canSelect} onKeyDown={onKeyDown} className="pb-6">
      <div
        role="row"
        className={cx(
          'sticky top-0 z-10 bg-surface grid items-center gap-4 h-12 px-4 sm:px-6 border-b border-line-soft text-sm font-medium text-ink',
          listColumns(showLocation),
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {canSelect && (
            <button
              role="checkbox"
              aria-checked={allSelected ? 'true' : selectionMode ? 'mixed' : 'false'}
              aria-label={allSelected ? 'Deselect all' : 'Select all'}
              title={allSelected ? 'Deselect all' : 'Select all'}
              onClick={toggleAll}
              className="w-8 h-8 -ml-1.5 rounded-full flex items-center justify-center shrink-0 hover:bg-hover"
            >
              <span className={cx('icon text-[22px]', selectionMode ? 'filled text-primary' : 'text-ink-2')}>
                {allSelected ? 'check_box' : selectionMode ? 'indeterminate_check_box' : 'check_box_outline_blank'}
              </span>
            </button>
          )}
          <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSortChange={onSortChange} />
        </div>
        {showLocation && (
          <span role="columnheader" className="hidden md:block">
            Location
          </span>
        )}
        <SortHeader label="Modified" field="modified" sortField={sortField} sortDir={sortDir} onSortChange={onSortChange} className="hidden md:flex" />
        <SortHeader label="Size" field="size" sortField={sortField} sortDir={sortDir} onSortChange={onSortChange} className="hidden md:flex" />
        <span />
      </div>
      {items.map((item) => (
        <FileRow key={item.key} item={item} selected={selected.has(item.key)} {...rowProps} />
      ))}
    </div>
  )
}

function SortHeader({
  label,
  field,
  sortField,
  sortDir,
  onSortChange,
  className,
}: {
  label: string
  field: SortField
  sortField: SortField
  sortDir: SortDir
  onSortChange: (field: SortField, dir: SortDir) => void
  className?: string
}) {
  const active = sortField === field
  const nextDir: SortDir = active ? (sortDir === 'asc' ? 'desc' : 'asc') : field === 'name' ? 'asc' : 'desc'
  return (
    <button
      role="columnheader"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSortChange(field, nextDir)}
      className={cx('flex items-center gap-1 h-8 -ml-2 px-2 rounded-full hover:bg-hover w-fit whitespace-nowrap', className)}
    >
      {label}
      <span className={cx('icon text-[18px] transition-transform', active ? 'text-ink' : 'invisible', active && sortDir === 'desc' && 'rotate-180')}>
        arrow_upward
      </span>
    </button>
  )
}
