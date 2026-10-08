import { categoryMeta, categoryOrder, cx, formatBytes, formatCount, formatPercent } from '../../lib'
import type { Category, UsageBucket } from '../../types'
import { ChartTooltip } from './ChartTooltip'
import { useChartTooltip } from './useChartTooltip'

type Props = {
  buckets: UsageBucket[]
  totalBytes: number
  selected: Category | ''
  onSelect: (c: Category | '') => void
}

/**
 * Storage by type: one stacked bar (part-to-whole) in a fixed category order so colours keep
 * their validated neighbours, plus a legend table that carries every label and value.
 */
export default function TypeBreakdown({ buckets, totalBytes, selected, onSelect }: Props) {
  const { containerRef, tip, show, hide } = useChartTooltip()
  const byKey = new Map(buckets.map((b) => [b.key as Category, b]))
  const segments = categoryOrder.map((c) => ({ category: c, bucket: byKey.get(c) })).filter((s) => s.bucket && s.bucket.bytes > 0)
  const rows = [...segments].sort((a, b) => b.bucket!.bytes - a.bucket!.bytes)

  return (
    <div>
      <div ref={containerRef} className="relative" onMouseLeave={hide}>
        <div className="flex h-6 rounded-full overflow-hidden gap-[2px] bg-surface" role="img" aria-label="Storage by file type">
          {segments.map(({ category, bucket }) => (
            <button
              key={category}
              aria-label={`${categoryMeta[category].label}: ${formatBytes(bucket!.bytes)}`}
              onClick={() => onSelect(selected === category ? '' : category)}
              onMouseMove={(e) =>
                show(
                  e,
                  <>
                    <div className="font-medium">{categoryMeta[category].label}</div>
                    <div>
                      {formatBytes(bucket!.bytes)} · {formatPercent(bucket!.bytes, totalBytes)} · {formatCount(bucket!.count)} files
                    </div>
                  </>,
                )
              }
              className={cx('h-full min-w-[6px] transition-opacity', selected && selected !== category && 'opacity-30')}
              style={{ flexGrow: bucket!.bytes, flexBasis: 0, background: categoryMeta[category].color }}
            />
          ))}
        </div>
        <ChartTooltip tip={tip} />
      </div>

      <table className="w-full mt-4 text-sm">
        <thead className="sr-only">
          <tr>
            <th>Type</th>
            <th>Size</th>
            <th>Share</th>
            <th className="hidden sm:table-cell">Files</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ category, bucket }) => (
            <tr
              key={category}
              onClick={() => onSelect(selected === category ? '' : category)}
              className={cx('cursor-pointer hover:bg-hover', selected === category && 'bg-selected hover:bg-selected')}
            >
              <td className="py-2 pl-2 rounded-l-lg">
                <span className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-[3px] shrink-0" style={{ background: categoryMeta[category].color }} />
                  <span className="text-ink">{categoryMeta[category].label}</span>
                </span>
              </td>
              <td className="py-2 text-right tabular-nums text-ink whitespace-nowrap">{formatBytes(bucket!.bytes)}</td>
              <td className="py-2 text-right tabular-nums text-ink-2 w-16 sm:w-20 whitespace-nowrap">{formatPercent(bucket!.bytes, totalBytes)}</td>
              <td className="hidden sm:table-cell py-2 pr-2 text-right tabular-nums text-ink-3 w-28 rounded-r-lg whitespace-nowrap">{formatCount(bucket!.count)} files</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
