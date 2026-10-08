import { buildPrefix, cx } from '../../lib'
import { IconButton } from '../ui/Button'

export type ViewMode = 'list' | 'grid'

type Props = {
  segments: string[]
  onNavigate: (prefix: string) => void
  searchQuery?: string
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  selectedCount: number
  onClearSelection: () => void
  onDownloadSelected?: () => void
  onDeleteSelected?: () => void
}

/** Breadcrumbs and view switch; replaced by the selection action bar while items are selected (like Drive). */
export default function Toolbar({
  segments,
  onNavigate,
  searchQuery,
  view,
  onViewChange,
  selectedCount,
  onClearSelection,
  onDownloadSelected,
  onDeleteSelected,
}: Props) {
  return (
    <div className="px-4 sm:px-6 pt-4 pb-3 shrink-0">
      {selectedCount > 0 ? (
        <div className="h-12 rounded-full bg-raised flex items-center gap-1 pl-1 pr-3 anim-fade">
          <IconButton icon="close" label="Clear selection" onClick={onClearSelection} />
          <span className="text-sm text-ink mr-2">{selectedCount} selected</span>
          {onDownloadSelected && <IconButton icon="download" label="Download" onClick={onDownloadSelected} />}
          {onDeleteSelected && <IconButton icon="delete" label="Delete" onClick={onDeleteSelected} />}
        </div>
      ) : (
        <div className="flex items-center gap-2 h-12">
          {searchQuery ? (
            <h1 className="text-2xl text-ink truncate flex-1">
              Results for <span className="text-ink-2">“{searchQuery}”</span>
            </h1>
          ) : (
            <nav aria-label="Folder path" className="flex items-center min-w-0 flex-1 overflow-x-auto scroll-thin">
              <Crumb label="My Drive" current={segments.length === 0} onClick={() => onNavigate('')} />
              {segments.map((part, i) => (
                <span key={`${i}-${part}`} className="flex items-center min-w-0">
                  <span className="icon text-ink-2 text-[24px]">chevron_right</span>
                  <Crumb label={part} current={i === segments.length - 1} onClick={() => onNavigate(buildPrefix(segments, i))} />
                </span>
              ))}
            </nav>
          )}

          <div className="flex items-center rounded-full border border-[#747775] overflow-hidden shrink-0" role="group" aria-label="Layout">
            <ViewButton active={view === 'list'} icon="view_list" label="List layout" onClick={() => onViewChange('list')} />
            <ViewButton active={view === 'grid'} icon="grid_view" label="Grid layout" onClick={() => onViewChange('grid')} />
          </div>
        </div>
      )}
    </div>
  )
}

function Crumb({ label, current, onClick }: { label: string; current: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={current ? 'page' : undefined}
      className={cx(
        'h-10 px-3 rounded-full truncate max-w-[240px] shrink-0 font-display transition-colors hover:bg-hover',
        current ? 'text-2xl text-ink' : 'text-2xl text-ink-2',
      )}
      title={label}
    >
      {label}
    </button>
  )
}

function ViewButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cx('h-8 w-14 flex items-center justify-center gap-1 transition-colors', active ? 'bg-primary-soft text-on-primary-soft' : 'text-ink-2 hover:bg-hover')}
    >
      {active && <span className="icon text-[18px]">check</span>}
      <span className="icon text-[20px]">{icon}</span>
    </button>
  )
}
