import { categoryMeta, categoryOrder, cx, modifiedRanges } from '../../lib'
import Menu from '../ui/Menu'
import { hasFilters, noFilters, type DriveFilters } from './filters'

type Props = {
  filters: DriveFilters
  onChange: (next: DriveFilters) => void
  shown: number
  total: number
}

/** Drive-style filter chips: Type and Modified, plus Clear. */
export default function FilterBar({ filters, onChange, shown, total }: Props) {
  const active = hasFilters(filters)
  const typeLabel = filters.type === 'folder' ? 'Folders' : filters.type ? categoryMeta[filters.type].label : 'Type'
  const typeIcon = filters.type === 'folder' ? 'folder' : filters.type ? categoryMeta[filters.type].icon : 'description'
  const modifiedLabel = modifiedRanges.find((r) => r.value === filters.modified)?.label ?? 'Modified'

  return (
    <div className="flex items-center gap-2 overflow-x-auto scroll-thin pb-1 -mb-1">
      <Menu
        align="left"
        trigger={({ toggle, open }) => (
          <Chip active={filters.type !== ''} open={open} onClick={toggle} icon={typeIcon}>
            {typeLabel}
          </Chip>
        )}
        items={[
          { label: 'Any type', checked: filters.type === '', onSelect: () => onChange({ ...filters, type: '' }) },
          'divider',
          { label: 'Folders', icon: 'folder', checked: filters.type === 'folder', onSelect: () => onChange({ ...filters, type: 'folder' }) },
          ...categoryOrder.map((c) => ({
            label: categoryMeta[c].label,
            icon: categoryMeta[c].icon,
            checked: filters.type === c,
            onSelect: () => onChange({ ...filters, type: c }),
          })),
        ]}
      />
      <Menu
        align="left"
        trigger={({ toggle, open }) => (
          <Chip active={filters.modified !== ''} open={open} onClick={toggle} icon="calendar_today">
            {modifiedLabel}
          </Chip>
        )}
        items={[
          { label: 'Any time', checked: filters.modified === '', onSelect: () => onChange({ ...filters, modified: '' }) },
          'divider',
          ...modifiedRanges.map((r) => ({ label: r.label, checked: filters.modified === r.value, onSelect: () => onChange({ ...filters, modified: r.value }) })),
        ]}
      />
      {active && (
        <>
          <button onClick={() => onChange(noFilters)} className="h-8 px-3 rounded-lg text-sm font-medium text-primary hover:bg-[#e8f0fe] shrink-0">
            Clear filters
          </button>
          <span className="text-xs text-ink-3 shrink-0 ml-1">
            {shown} of {total}
          </span>
        </>
      )}
    </div>
  )
}

function Chip({ active, open, onClick, icon, children }: { active: boolean; open: boolean; onClick: () => void; icon: string; children: string }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={cx(
        'h-8 pl-2.5 pr-1.5 rounded-lg inline-flex items-center gap-1.5 text-sm shrink-0 transition-colors',
        active ? 'bg-primary-soft text-on-primary-soft font-medium' : 'border border-[#747775] text-ink-2 hover:bg-hover',
      )}
    >
      <span className="icon text-[18px]">{active ? 'check' : icon}</span>
      {children}
      <span className={cx('icon text-[18px] transition-transform', open && 'rotate-180')}>arrow_drop_down</span>
    </button>
  )
}
