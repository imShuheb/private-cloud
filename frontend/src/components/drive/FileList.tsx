import { useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { cx, type SortDir, type SortField } from '../../lib'
import type { DriveItem } from '../../types'
import FileRow, { FileCard } from './FileRow'
import type { ItemActions } from './itemActions'
import type { ViewMode } from './Toolbar'

type Props = ItemActions & {
  items: DriveItem[]
  view: ViewMode
  sortField: SortField
  sortDir: SortDir
  onSortChange: (field: SortField, dir: SortDir) => void
  selected: Set<string>
  onSelectionChange: (next: Set<string>) => void
  canSelect: boolean
  showLocation: boolean
}

/** List or grid of items with Drive-style selection: click, Ctrl/Cmd-click, Shift-click, Ctrl/Cmd+A. */
export default function FileList({
  items,
  view,
  sortField,
  sortDir,
  onSortChange,
  selected,
  onSelectionChange,
  canSelect,
  showLocation,
  ...actions
}: Props) {
  const anchor = useRef<string | null>(null)

  function select(item: DriveItem, e: MouseEvent) {
    if (!canSelect) return
    const keys = items.map((i) => i.key)
    if (e.shiftKey && anchor.current && keys.includes(anchor.current)) {
      const [a, b] = [keys.indexOf(anchor.current), keys.indexOf(item.key)].sort((x, y) => x - y)
      onSelectionChange(new Set(keys.slice(a, b + 1)))
      return
    }
    anchor.current = item.key
    if (e.metaKey || e.ctrlKey) {
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

  function onKeyDown(e: KeyboardEvent) {
    if (canSelect && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      onSelectionChange(new Set(items.map((i) => i.key)))
    }
    if (e.key === 'Escape' && selected.size > 0) onSelectionChange(new Set())
  }

  const rowProps = { canSelect, onSelect: select, onToggle: toggle, showLocation, ...actions }

  if (view === 'grid') {
    const folders = items.filter((i) => i.kind === 'folder')
    const files = items.filter((i) => i.kind === 'file')
    return (
      <div role="grid" aria-multiselectable={canSelect} onKeyDown={onKeyDown} className="px-4 sm:px-6 pb-6 space-y-6">
        {folders.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-ink mb-3">Folders</h2>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
              {folders.map((item) => (
                <FileCard key={item.key} item={item} selected={selected.has(item.key)} {...rowProps} />
              ))}
            </div>
          </section>
        )}
        {files.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-ink mb-3">Files</h2>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
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
          showLocation ? 'grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_200px_140px_100px_40px]' : 'grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[minmax(0,1fr)_140px_100px_40px]',
        )}
      >
        <SortHeader label="Name" field="name" sortField={sortField} sortDir={sortDir} onSortChange={onSortChange} />
        {showLocation && <span role="columnheader" className="hidden md:block">Location</span>}
        <SortHeader label="Last modified" field="modified" sortField={sortField} sortDir={sortDir} onSortChange={onSortChange} className="hidden md:flex" />
        <SortHeader label="File size" field="size" sortField={sortField} sortDir={sortDir} onSortChange={onSortChange} className="hidden md:flex" />
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
      className={cx('flex items-center gap-1 h-8 -ml-2 px-2 rounded-full hover:bg-hover w-fit', className)}
    >
      {label}
      <span className={cx('icon text-[18px] transition-transform', active ? 'text-ink' : 'invisible', active && sortDir === 'desc' && 'rotate-180')}>
        arrow_upward
      </span>
    </button>
  )
}
