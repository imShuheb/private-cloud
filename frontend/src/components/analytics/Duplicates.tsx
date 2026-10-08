import { baseName, folderLabel, formatBytes, formatCount, parentOf } from '../../lib'
import type { DuplicateGroup } from '../../types'

/** Groups of files with identical content (same size and checksum), ranked by wasted space. */
export default function Duplicates({ groups, onOpenFolder }: { groups: DuplicateGroup[]; onOpenFolder: (folder: string) => void }) {
  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-3 text-sm text-ink-2 py-4">
        <span className="icon filled text-success">check_circle</span>
        No duplicate files over 1 MB found.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-line-soft">
      {groups.map((g) => (
        <li key={g.keys.join('|')} className="py-3">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-sm text-ink font-medium truncate" title={g.keys[0]}>
              {baseName(g.keys[0])}
            </span>
            <span className="text-sm tabular-nums text-ink shrink-0">
              {formatBytes(g.wastedBytes)} <span className="text-ink-3">wasted</span>
            </span>
          </div>
          <div className="text-xs text-ink-3 mb-1.5">
            {formatCount(g.count)} copies × {formatBytes(g.size)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.keys.map((k) => (
              <button
                key={k}
                onClick={() => onOpenFolder(parentOf(k))}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-raised text-xs text-ink-2 hover:bg-press max-w-full"
                title={k}
              >
                <span className="icon text-[16px] file-folder filled">folder</span>
                <span className="truncate">
                  {folderLabel(parentOf(k))} / <span className="text-ink">{baseName(k)}</span>
                </span>
              </button>
            ))}
            {g.count > g.keys.length && <span className="text-xs text-ink-3 self-center">+{formatCount(g.count - g.keys.length)} more</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}
