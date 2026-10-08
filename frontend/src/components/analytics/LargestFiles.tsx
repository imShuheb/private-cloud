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
  onDelete: (file: AnalyticsFile) => void
}

/** The biggest files of the last scan, filterable and sortable, 50 per page. */
export default function LargestFiles(props: Props) {
  const { reportAt, maxFiles, category, onCategoryChange, folder, onFolderChange, version, canWrite } = props
  const [sort, setSort] = useState<FileSort>('size')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [minSize, setMinSize] = useState(0)
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search, 300)
  const [pageIndex, setPageIndex] = useState(0)

  // Any filter change goes back to the first page
  const filterKey = `${category}|${folder}|${minSize}|${q}|${sort}|${order}`
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setPageIndex(0)
  }

  const { page, loading, error } = useAnalyticsFiles(
    { sort, order, category, q, minSize, folder, offset: pageIndex * PAGE_SIZE, limit: PAGE_SIZE },
    reportAt,
    version,
  )
  const total = page?.total ?? 0
  const from = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1
  const to = Math.min(total, (pageIndex + 1) * PAGE_SIZE)

  function sortBy(field: FileSort) {
    if (sort === field) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(field)
      setOrder(field === 'name' || field === 'type' ? 'asc' : 'desc')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
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
          trigger={({ toggle }) => (
            <Chip active={!!category} onClick={toggle} icon={category ? categoryMeta[category].icon : 'category'}>
              {category ? categoryMeta[category].label : 'Type'}
            </Chip>
          )}
          items={[
            { label: 'All types', onSelect: () => onCategoryChange(''), checked: !category },
            'divider',
            ...categoryOrder.map((c) => ({ label: categoryMeta[c].label, icon: categoryMeta[c].icon, checked: category === c, onSelect: () => onCategoryChange(c) })),
          ]}
        />
        <Menu
          align="left"
          trigger={({ toggle }) => (
            <Chip active={minSize > 0} onClick={toggle} icon="straighten">
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
        <div className="ml-auto text-xs text-ink-3 flex items-center gap-2">
          {loading && <Spinner small className="text-primary" />}
          {total > 0 ? `${formatCount(from)}–${formatCount(to)} of ${formatCount(total)}` : !loading && 'No files'}
        </div>
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-ink border-b border-line-soft">
              <SortTh label="Name" field="name" sort={sort} order={order} onSort={sortBy} />
              <th className="font-medium py-3 pr-4">Location</th>
              <SortTh label="Type" field="type" sort={sort} order={order} onSort={sortBy} />
              <SortTh label="Modified" field="modified" sort={sort} order={order} onSort={sortBy} />
              <SortTh label="Size" field="size" sort={sort} order={order} onSort={sortBy} align="right" />
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className={cx(loading && 'opacity-60 transition-opacity')}>
            {page?.items.map((f) => {
              const icon = getFileIcon(f.name)
              return (
                <tr key={f.key} className="group border-b border-line-soft hover:bg-hover">
                  <td className="py-2.5 pr-4 max-w-0 w-[34%]">
                    <button className="flex items-center gap-3 min-w-0 max-w-full text-left" onClick={() => props.onPreview(f)} title={`Preview ${f.key}`}>
                      <span className={cx('icon', icon.className)}>{icon.icon}</span>
                      <span className="truncate text-ink font-medium hover:underline">{f.name}</span>
                    </button>
                  </td>
                  <td className="py-2.5 pr-4 max-w-0 w-[26%]">
                    <button className="flex items-center gap-2 min-w-0 max-w-full text-ink-2 hover:text-primary" onClick={() => props.onOpenFolder(f.folder)} title={`Open ${folderLabel(f.folder)}`}>
                      <span className="icon text-[18px] file-folder filled">folder</span>
                      <span className="truncate">{folderLabel(f.folder)}</span>
                    </button>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: categoryMeta[f.category].color }} />
                      {categoryMeta[f.category].label}
                      {f.extension && <span className="text-ink-3 uppercase text-xs">.{f.extension}</span>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-ink-2 whitespace-nowrap">{formatDate(f.lastModified)}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink font-medium whitespace-nowrap">{formatBytes(f.size)}</td>
                  <td className="py-1 text-right">
                    <Menu
                      trigger={({ toggle }) => <IconButton icon="more_vert" label={`Actions for ${f.name}`} onClick={toggle} className="w-8 h-8" />}
                      items={[
                        { label: 'Preview', icon: 'visibility', onSelect: () => props.onPreview(f) },
                        { label: 'Download', icon: 'download', onSelect: () => props.onDownload(f) },
                        { label: 'Open folder', icon: 'folder_open', onSelect: () => props.onOpenFolder(f.folder) },
                        ...(canWrite ? (['divider', { label: 'Delete', icon: 'delete', danger: true, onSelect: () => props.onDelete(f) }] as const) : []),
                      ]}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {page && page.items.length === 0 && !loading && (
        <p className="text-sm text-ink-3 text-center py-10">No files match these filters.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <p className="text-xs text-ink-3">The scan keeps the {formatCount(maxFiles)} largest files for this list.</p>
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
        'h-8 pl-2 pr-1 rounded-lg border inline-flex items-center gap-1.5 text-sm transition-colors max-w-[260px]',
        active ? 'bg-primary-soft border-transparent text-on-primary-soft' : 'border-[#747775] text-ink-2 hover:bg-hover',
      )}
    >
      <span className="icon text-[18px]">{icon}</span>
      <span className="truncate">{children}</span>
      <span className="icon text-[18px]">{trailingIcon}</span>
    </button>
  )
}

function SortTh({ label, field, sort, order, onSort, align }: { label: string; field: FileSort; sort: FileSort; order: 'asc' | 'desc'; onSort: (f: FileSort) => void; align?: 'right' }) {
  const active = sort === field
  return (
    <th className={cx('font-medium py-2 pr-4', align === 'right' && 'text-right pr-0')} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(field)} className={cx('inline-flex items-center gap-1 h-8 px-2 -mx-2 rounded-full hover:bg-hover', align === 'right' && 'flex-row-reverse')}>
        {label}
        <span className={cx('icon text-[18px]', !active && 'invisible', active && order === 'desc' && 'rotate-180')}>arrow_upward</span>
      </button>
    </th>
  )
}
