import { formatBytes, formatCount } from '../../lib'
import type { DriveItem } from '../../types'
import Button from '../ui/Button'

type Props = {
  items: DriveItem[]
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  note?: string
}

/** Footer under the listing: item counts, and "Load more" for large folders. */
export default function StatusBar({ items, hasMore, loadingMore, onLoadMore, note }: Props) {
  const folders = items.filter((i) => i.kind === 'folder').length
  const files = items.filter((i) => i.kind === 'file')
  const bytes = files.reduce((sum, f) => sum + (f.kind === 'file' ? f.size : 0), 0)

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-xs text-ink-3">
      {hasMore && onLoadMore && (
        <Button variant="outlined" onClick={onLoadMore} loading={loadingMore}>
          Load more
        </Button>
      )}
      <span>
        {formatCount(folders)} folder{folders === 1 ? '' : 's'} · {formatCount(files.length)} file{files.length === 1 ? '' : 's'}
        {files.length > 0 && ` · ${formatBytes(bytes)}`}
        {hasMore && ' shown'}
      </span>
      {note && <span>{note}</span>}
    </div>
  )
}
