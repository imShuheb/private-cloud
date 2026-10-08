import { formatBytes, formatCount } from '../../lib'
import type { AnalyticsReport } from '../../types'

/** Headline numbers: single values, so stat tiles rather than charts. */
export default function KpiTiles({ report, onLargestClick }: { report: AnalyticsReport; onLargestClick: () => void }) {
  const avg = report.totalFiles > 0 ? report.totalBytes / report.totalFiles : 0
  return (
    <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
      <Tile label="Storage used" value={formatBytes(report.totalBytes)} detail={`${formatCount(report.totalBytes)} bytes`} highlight />
      <Tile label="Files" value={formatCount(report.totalFiles)} detail={`Average ${formatBytes(avg)}`} />
      <Tile label="Folders" value={formatCount(report.totalFolders)} detail="Including nested folders" />
      <Tile
        label="Largest file"
        value={report.largestFile ? formatBytes(report.largestFile.size) : '—'}
        detail={report.largestFile?.name ?? 'No files'}
        title={report.largestFile?.key}
        onClick={report.largestFile ? onLargestClick : undefined}
      />
    </div>
  )
}

function Tile({ label, value, detail, highlight, title, onClick }: { label: string; value: string; detail: string; highlight?: boolean; title?: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="text-sm text-ink-2">{label}</div>
      <div className="font-display text-[28px] sm:text-[32px] leading-10 text-ink mt-1 truncate">{value}</div>
      <div className="text-xs text-ink-3 mt-1 truncate" title={title}>
        {detail}
      </div>
    </>
  )
  const base = 'min-w-0 rounded-2xl p-4 sm:p-5 text-left anim-fade'
  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} border border-line-soft hover:bg-hover transition-colors`}>
        {body}
      </button>
    )
  }
  return <div className={`${base} ${highlight ? 'bg-raised' : 'border border-line-soft'}`}>{body}</div>
}
