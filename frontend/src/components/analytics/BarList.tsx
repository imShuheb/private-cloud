import type { MouseEvent, ReactNode } from 'react'
import { cx, formatBytes, formatCount, formatPercent } from '../../lib'
import { ChartTooltip } from './ChartTooltip'
import { useChartTooltip } from './useChartTooltip'

export type BarRow = {
  key: string
  label: ReactNode
  title: string
  bytes: number
  count: number
}

type Props = {
  rows: BarRow[]
  total: number
  countNoun?: string
  onRowClick?: (key: string) => void
  activeKey?: string
  emptyText?: string
}

/** Single-series horizontal bars (one hue, no legend), labelled directly with size and share. */
export default function BarList({ rows, total, countNoun = 'files', onRowClick, activeKey, emptyText = 'Nothing to show' }: Props) {
  const { containerRef, tip, show, hide } = useChartTooltip()
  const max = Math.max(1, ...rows.map((r) => r.bytes))

  if (rows.length === 0) return <p className="text-sm text-ink-3 py-6 text-center">{emptyText}</p>

  return (
    <div ref={containerRef} className="relative" onMouseLeave={hide}>
      <ul className="space-y-1">
        {rows.map((row) => {
          const content = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink" title={row.title}>
                  {row.label}
                </span>
                <span className="shrink-0 tabular-nums text-ink">
                  {formatBytes(row.bytes)} <span className="text-ink-3">· {formatPercent(row.bytes, total)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-raised">
                <div className="h-full rounded-full bg-series transition-[width] duration-500" style={{ width: row.bytes > 0 ? `${Math.max(1, (row.bytes / max) * 100)}%` : '0%' }} />
              </div>
            </>
          )
          const onMove = (e: MouseEvent) =>
            show(
              e,
              <>
                <div className="font-medium max-w-[280px] truncate">{row.title}</div>
                <div>
                  {formatBytes(row.bytes)} · {formatCount(row.count)} {countNoun}
                </div>
              </>,
            )
          return (
            <li key={row.key}>
              {onRowClick ? (
                <button
                  onClick={() => onRowClick(row.key)}
                  onMouseMove={onMove}
                  className={cx('w-full text-left px-3 py-2 rounded-lg hover:bg-hover', activeKey === row.key && 'bg-selected hover:bg-selected')}
                >
                  {content}
                </button>
              ) : (
                <div onMouseMove={onMove} className="px-3 py-2 rounded-lg hover:bg-hover">
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  )
}
