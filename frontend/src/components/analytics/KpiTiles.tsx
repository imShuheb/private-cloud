import { formatBytes, formatCount } from '../../lib'
import type { AnalyticsReport } from '../../types'

/** Headline numbers: these are single values, so stat tiles rather than charts. */
export default function KpiTiles({ report, onLargestClick }: { report: AnalyticsReport; onLargestClick: () => void }) {
  const avg = report.totalFiles > 0 ? report.totalBytes / report.totalFiles : 0
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <div className="col-span-2 lg:col-span-1 rounded-2xl bg-raised p-5 anim-fade">
        <div className="text-sm text-ink-2">Storage used</div>
        <div className="font-display text-[40px] leading-[48px] text-ink mt-1">{formatBytes(report.totalBytes)}</div>
        <div className="text-xs text-ink-3 mt-1">{formatCount(report.totalBytes)} bytes</div>
      </div>
      <Tile label="Files" value={formatCount(report.totalFiles)} detail={`avg ${formatBytes(avg)} each`} />
      <Tile label="Folders" value={formatCount(report.totalFolders)} />
      <button onClick={onLargestClick} className="text-left rounded-2xl border border-line-soft p-5 hover:bg-hover transition-colors anim-fade min-w-0">
        <div className="text-sm text-ink-2">Largest file</div>
        <div className="font-display text-[28px] leading-9 text-ink mt-1">{report.largestFile ? formatBytes(report.largestFile.size) : '—'}</div>
        <div className="text-xs text-ink-3 mt-1 truncate" title={report.largestFile?.key}>
          {report.largestFile?.name ?? 'No files'}
        </div>
      </button>
    </div>
  )
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-line-soft p-5 anim-fade">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="font-display text-[28px] leading-9 text-ink mt-1">{value}</div>
      {detail && <div className="text-xs text-ink-3 mt-1">{detail}</div>}
    </div>
  )
}
