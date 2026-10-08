import { useState, type ReactNode } from 'react'
import { useAnalyticsFiles } from '../../hooks/useAnalyticsFiles'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { categoryMeta, categoryOrder, cx, folderLabel, formatBytes, formatCount, formatDate, getFileIcon } from '../../lib'
import type { AnalyticsFile, Category, FileSort } from '../../types'
import Button, { IconButton, Spinner } from '../ui/Button'
import Menu from '../ui/Menu'

const PAGE_SIZE = 50

const minSizeOptions = [
  { label: 'Any size', value: 0 },
  { label: 'Over 10 MB', value: 10 << 20 },
  { label: 'Over 100 MB', value: 100 << 20 },
  { label: 'Over 1 GB', value: 1 << 30 },
]

type Props = {
  reportAt: string
  maxFiles: number
  category: Category | ''
  onCategoryChange: (c: Category | '') => void
  folder: string
  onFolderChange: (folder: string) => void
  version: number
  canWrite: boolean
  onPreview: (file: AnalyticsFile) => void
  onDownload: (file: AnalyticsFile) => void
  onOpenFolder: (folder: string) => void
  onDelete: (files: AnalyticsFile[]) => void
}

/** The biggest files of the last scan: filter, sort, select and delete, 50 per page. */
export default function LargestFiles(props: Props) {
  const { reportAt, maxFiles, category, onCategoryChange, folder, onFolderChange, version, canWrite } = props
  const [sort, setSort] = useState<FileSort>('size')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [minSize, setMinSize] = useState(0)
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search, 300)
  const [pageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<Map<string, AnalyticsFile>>(new Map())

  // Any change of filters or data goes back to page one with nothing selected
  const resetKey = `${category}|${folder}|${minSize}|${q}|${sort}|${order}|${version}|${reportAt}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setPageIndex(0)
    setSelected(new Map())
  }

  const { page, loading, error } = useAnalyticsFiles(
    { sort, order, category, q, minSize, folder, offset: pageIndex * PAGE_SIZE, limit: PAGE_SIZE },
    reportAt,
    version,
  )
  const items = page?.items ?? []
  const total = page?.total ?? 0
  const from = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1
  const to = Math.min(total, (pageIndex + 1) * PAGE_SIZE)
  const filtered = !!category || !!folder || minSize > 0 || search.trim() !== ''
  const pageAllSelected = items.length > 0 && items.every((f) => selected.has(f.key))
  const selectedBytes = [...selected.values()].reduce((sum, f) => sum + f.size, 0)

  function sortBy(field: FileSort) {
    if (sort === field) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(field)
      setOrder(field === 'name' || field === 'type' ? 'asc' : 'desc')
    }
  }

  function toggle(f: AnalyticsFile) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(f.key)) next.delete(f.key)
      else next.set(f.key, f)
      return next
    })
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Map(prev)
      if (pageAllSelected) items.forEach((f) => next.delete(f.key))
      else items.forEach((f) => next.set(f.key, f))
      return next
    })
  }

  function clearFilters() {
    setSearch('')
    setMinSize(0)
    onCategoryChange('')
    onFolderChange('')
  }

  return (
    <div>
      {selected.size > 0 ? (
        <div className="h-12 mb-4 rounded-full bg-raised flex items-center gap-1 pl-1 pr-2 anim-fade">
          <IconButton icon="close" label="Clear selection" onClick={() => setSelected(new Map())} />
          <span className="text-sm font-medium text-ink whitespace-nowrap">
            {selected.size} selected <span className="text-ink-3 font-normal">· {formatBytes(selectedBytes)}</span>
          </span>
          <div className="flex-1" />
          {canWrite && (
            <Button variant="danger" icon="delete" className="h-9 px-4" onClick={() => props.onDelete([...selected.values()])}>
              <span className="hidden sm:inline">Delete</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
            <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 text-[20px]">search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or path"
              aria-label="Filter by name or path"
              className="w-full h-10 pl-10 pr-3 rounded-full bg-raised text-sm outline-none focus:bg-surface focus:shadow-menu"
            />
          </div>
          <Menu
            align="left"
            trigger={({ toggle: open }) => (
              <Chip active={!!category} onClick={open} icon={category ? categoryMeta[category].icon : 'category'}>
                {category ? categoryMeta[category].label : 'Type'}
              </Chip>
            )}
            items={[
              { label: 'Any type', onSelect: () => onCategoryChange(''), checked: !category },
              'divider',
              ...categoryOrder.map((c) => ({ label: categoryMeta[c].label, icon: categoryMeta[c].icon, checked: category === c, onSelect: () => onCategoryChange(c) })),
            ]}
          />
          <Menu
            align="left"
            trigger={({ toggle: open }) => (
              <Chip active={minSize > 0} onClick={open} icon="straighten">
                {minSizeOptions.find((o) => o.value === minSize)?.label ?? 'Size'}
              </Chip>
            )}
            items={minSizeOptions.map((o) => ({ label: o.label, checked: o.value === minSize, onSelect: () => setMinSize(o.value) }))}
          />
          {folder && (
            <Chip active onClick={() => onFolderChange('')} icon="folder" trailingIcon="close">
              {folderLabel(folder)}
            </Chip>
          )}
          {filtered && (
            <button onClick={clearFilters} className="h-8 px-3 rounded-lg text-sm font-medium text-primary hover:bg-[#e8f0fe]">
              Clear filters
            </button>
          )}
          <div className="ml-auto text-xs text-ink-3 flex items-center gap-2">
            {loading && <Spinner small className="text-primary" />}
            {total > 0 ? `${formatCount(from)}–${formatCount(to)} of ${formatCount(total)}` : !loading && 'No files'}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="text-left text-ink border-b border-line-soft">
            {canWrite && (
              <th className="w-10 py-2">
                <button
                  role="checkbox"
                  aria-checked={pageAllSelected ? 'true' : selected.size > 0 ? 'mixed' : 'false'}
                  aria-label={pageAllSelected ? 'Deselect this page' : 'Select this page'}
                  title={pageAllSelected ? 'Deselect this page' : 'Select this page'}
                  onClick={togglePage}
                  className="w-8 h-8 -ml-1.5 rounded-full flex items-center justify-center hover:bg-hover"
                >
                  <span className={cx('icon text-[22px]', selected.size > 0 ? 'filled text-primary' : 'text-ink-2')}>
                    {pageAllSelected ? 'check_box' : selected.size > 0 ? 'indeterminate_check_box' : 'check_box_outline_blank'}
                  </span>
                </button>
              </th>
            )}
            <SortTh label="Name" field="name" sort={sort} order={order} onSort={sortBy} />
            <th className="hidden lg:table-cell font-medium py-3 pr-4 w-[24%]">Location</th>
            <SortTh label="Type" field="type" sort={sort} order={order} onSort={sortBy} className="hidden md:table-cell w-[16%]" />
            <SortTh label="Modified" field="modified" sort={sort} order={order} onSort={sortBy} className="hidden md:table-cell w-[13%]" />
            <SortTh label="Size" field="size" sort={sort} order={order} onSort={sortBy} align="right" className="w-24" />
            <th className="w-12" />
          </tr>
        </thead>
        <tbody className={cx(loading && 'opacity-60 transition-opacity')}>
          {items.map((f) => {
            const icon = getFileIcon(f.name)
            const isSelected = selected.has(f.key)
            return (
              <tr key={f.key} className={cx('group border-b border-line-soft', isSelected ? 'bg-selected' : 'hover:bg-hover')}>
                {canWrite && (
                  <td className="py-2">
                    <button
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`Select ${f.name}`}
                      onClick={() => toggle(f)}
                      className="w-8 h-8 -ml-1.5 rounded-full flex items-center justify-center hover:bg-press"
                    >
                      <span className={cx('icon text-[22px]', isSelected ? 'filled text-primary' : 'text-ink-2')}>{isSelected ? 'check_box' : 'check_box_outline_blank'}</span>
                    </button>
                  </td>
                )}
                <td className="py-2 pr-4">
                  <button className="flex items-center gap-3 min-w-0 max-w-full text-left" onClick={() => props.onPreview(f)} title={`Preview ${f.key}`}>
                    <span className={cx('icon', icon.className)}>{icon.icon}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-ink font-medium hover:underline">{f.name}</span>
                      <span className="block lg:hidden text-xs text-ink-3 truncate">
                        {folderLabel(f.folder)}
                        <span className="md:hidden"> · {formatDate(f.lastModified)}</span>
                      </span>
                    </span>
                  </button>
                </td>
                <td className="hidden lg:table-cell py-2 pr-4">
                  <button className="flex items-center gap-2 min-w-0 max-w-full text-ink-2 hover:text-primary" onClick={() => props.onOpenFolder(f.folder)} title={`Open ${folderLabel(f.folder)}`}>
                    <span className="icon text-[18px] file-folder filled">folder</span>
                    <span className="truncate">{folderLabel(f.folder)}</span>
                  </button>
                </td>
                <td className="hidden md:table-cell py-2 pr-4">
                  <span className="flex items-center gap-2 text-ink-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: categoryMeta[f.category].color }} />
                    <span className="truncate">{categoryMeta[f.category].label}</span>
                  </span>
                </td>
                <td className="hidden md:table-cell py-2 pr-4 text-ink-2 whitespace-nowrap">{formatDate(f.lastModified)}</td>
                <td className="py-2 text-right tabular-nums text-ink font-medium whitespace-nowrap">{formatBytes(f.size)}</td>
                <td className="py-1 text-right">
                  <Menu
                    trigger={({ toggle: open }) => <IconButton icon="more_vert" label={`Actions for ${f.name}`} onClick={open} className="w-8 h-8" />}
                    items={[
                      { label: 'Preview', icon: 'visibility', onSelect: () => props.onPreview(f) },
                      { label: 'Download', icon: 'download', onSelect: () => props.onDownload(f) },
                      { label: 'Open folder', icon: 'folder_open', onSelect: () => props.onOpenFolder(f.folder) },
                      ...(canWrite ? (['divider', { label: 'Delete', icon: 'delete', danger: true, onSelect: () => props.onDelete([f]) }] as const) : []),
                    ]}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {page && items.length === 0 && !loading && (
        <div className="text-center py-10">
          <p className="text-sm text-ink-3">No files match these filters.</p>
          {filtered && (
            <Button variant="text" className="mt-2" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <p className="text-xs text-ink-3">Covers the {formatCount(maxFiles)} largest files.</p>
        <div className="flex items-center gap-1">
          <Button variant="text" icon="chevron_left" disabled={pageIndex === 0 || loading} onClick={() => setPageIndex((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="text" disabled={to >= total || loading} onClick={() => setPageIndex((p) => p + 1)}>
            Next
            <span className="icon text-[18px]">chevron_right</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

function Chip({ active, onClick, icon, trailingIcon = 'arrow_drop_down', children }: { active: boolean; onClick: () => void; icon: string; trailingIcon?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'h-8 pl-2.5 pr-1.5 rounded-lg inline-flex items-center gap-1.5 text-sm transition-colors max-w-[260px] shrink-0',
        active ? 'bg-primary-soft text-on-primary-soft font-medium' : 'border border-[#747775] text-ink-2 hover:bg-hover',
      )}
    >
      <span className="icon text-[18px]">{active && trailingIcon !== 'close' ? 'check' : icon}</span>
      <span className="truncate">{children}</span>
      <span className="icon text-[18px]">{trailingIcon}</span>
    </button>
  )
}

function SortTh({
  label,
  field,
  sort,
  order,
  onSort,
  align,
  className,
}: {
  label: string
  field: FileSort
  sort: FileSort
  order: 'asc' | 'desc'
  onSort: (f: FileSort) => void
  align?: 'right'
  className?: string
}) {
  const active = sort === field
  return (
    <th className={cx('font-medium py-2 pr-4', align === 'right' && 'text-right pr-0', className)} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(field)} className={cx('inline-flex items-center gap-1 h-8 px-2 -mx-2 rounded-full hover:bg-hover whitespace-nowrap', align === 'right' && 'flex-row-reverse')}>
        {label}
        <span className={cx('icon text-[18px]', !active && 'invisible', active && order === 'desc' && 'rotate-180')}>arrow_upward</span>
      </button>
    </th>
  )
}
