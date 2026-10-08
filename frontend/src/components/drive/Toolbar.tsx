import type { ReactNode } from 'react'
import { buildPrefix, cx } from '../../lib'
import Button, { IconButton } from '../ui/Button'
import Menu from '../ui/Menu'

export type ViewMode = 'list' | 'grid'

type Props = {
  segments: string[]
  onNavigate: (prefix: string) => void
  searchQuery?: string
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onClearSelection: () => void
  onDownloadSelected?: () => void
  onDeleteSelected?: () => void
  filters?: ReactNode
}

/** Title row (breadcrumbs or search title) and filters; the selection bar takes the title row's place. */
export default function Toolbar({
  segments,
  onNavigate,
  searchQuery,
  view,
  onViewChange,
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onDownloadSelected,
  onDeleteSelected,
  filters,
}: Props) {
  return (
    <div className="px-4 sm:px-6 pt-3 pb-2 shrink-0 space-y-2">
      {selectedCount > 0 ? (
        <div className="h-12 rounded-full bg-raised flex items-center gap-1 pl-1 pr-2 anim-fade">
          <IconButton icon="close" label="Clear selection" onClick={onClearSelection} />
          <span className="text-sm font-medium text-ink mr-1 whitespace-nowrap">{selectedCount} selected</span>
          {selectedCount < totalCount && (
            <Button variant="text" className="h-8 px-3" onClick={onSelectAll}>
              Select all {totalCount}
            </Button>
          )}
          <div className="flex-1" />
          {onDownloadSelected && <IconButton icon="download" label="Download selected files" onClick={onDownloadSelected} />}
          {onDeleteSelected && (
            <Button variant="danger" icon="delete" className="h-9 px-4 ml-1" onClick={onDeleteSelected}>
              <span className="hidden sm:inline">Delete</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 h-12">
          {searchQuery ? (
            <h1 className="text-[22px] sm:text-2xl text-ink truncate flex-1 min-w-0">
              Results for <span className="text-ink-2">“{searchQuery}”</span>
            </h1>
          ) : (
            <Breadcrumbs segments={segments} onNavigate={onNavigate} />
          )}
          <ViewToggle view={view} onViewChange={onViewChange} />
        </div>
      )}
      {filters}
    </div>
  )
}

function Breadcrumbs({ segments, onNavigate }: { segments: string[]; onNavigate: (prefix: string) => void }) {
  const current = segments.at(-1)
  const parent = segments.length > 1 ? buildPrefix(segments, segments.length - 2) : ''

  // Phones: back arrow + current folder name
  const compact = (
    <div className="flex sm:hidden items-center gap-1 min-w-0 flex-1">
      {segments.length > 0 && <IconButton icon="arrow_back" label="Back to parent folder" onClick={() => onNavigate(parent)} className="-ml-2 shrink-0" />}
      <h1 className="text-[22px] text-ink truncate">{current ?? 'My Drive'}</h1>
    </div>
  )

  // Wider screens: full trail, with the middle folded into a menu when it gets long
  const hidden = segments.length > 3 ? segments.slice(0, segments.length - 2) : []
  const visibleStart = hidden.length
  const full = (
    <nav aria-label="Folder path" className="hidden sm:flex items-center min-w-0 flex-1">
      <Crumb label="My Drive" current={segments.length === 0} onClick={() => onNavigate('')} />
      {hidden.length > 0 && (
        <>
          <Chevron />
          <Menu
            align="left"
            trigger={({ toggle }) => <IconButton icon="more_horiz" label="Show hidden folders" onClick={toggle} />}
            items={hidden.map((name, i) => ({ label: name, icon: 'folder', onSelect: () => onNavigate(buildPrefix(segments, i)) }))}
          />
        </>
      )}
      {segments.slice(visibleStart).map((part, j) => {
        const i = visibleStart + j
        return (
          <span key={`${i}-${part}`} className="flex items-center min-w-0">
            <Chevron />
            <Crumb label={part} current={i === segments.length - 1} onClick={() => onNavigate(buildPrefix(segments, i))} />
          </span>
        )
      })}
    </nav>
  )

  return (
    <>
      {compact}
      {full}
    </>
  )
}

function Chevron() {
  return <span className="icon text-ink-2 text-[24px] shrink-0">chevron_right</span>
}

function Crumb({ label, current, onClick }: { label: string; current: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      className={cx(
        'h-10 px-3 rounded-full truncate min-w-0 font-display text-2xl transition-colors hover:bg-hover',
        current ? 'text-ink max-w-[320px]' : 'text-ink-2 max-w-[180px] shrink-[2]',
      )}
      title={label}
    >
      {label}
    </button>
  )
}

function ViewToggle({ view, onViewChange }: { view: ViewMode; onViewChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center rounded-full border border-[#747775] overflow-hidden shrink-0" role="group" aria-label="Layout">
      {(
        [
          ['list', 'view_list', 'List layout'],
          ['grid', 'grid_view', 'Grid layout'],
        ] as const
      ).map(([value, icon, label]) => (
        <button
          key={value}
          onClick={() => onViewChange(value)}
          aria-pressed={view === value}
          aria-label={label}
          title={label}
          className={cx('h-8 w-12 sm:w-14 flex items-center justify-center gap-1 transition-colors', view === value ? 'bg-primary-soft text-on-primary-soft' : 'text-ink-2 hover:bg-hover')}
        >
          {view === value && <span className="icon text-[16px] hidden sm:inline">check</span>}
          <span className="icon text-[20px]">{icon}</span>
        </button>
      ))}
    </div>
  )
}
