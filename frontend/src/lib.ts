import type { Category, DriveItem } from './types'

/** Must match the server's minimum (internal/api/handlers_users.go). */
export const MIN_PASSWORD_LENGTH = 8

export type SortField = 'name' | 'size' | 'modified'
export type SortDir = 'asc' | 'desc'

export function formatBytes(size = 0): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const p = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / Math.pow(1024, p)
  return `${value.toFixed(value < 10 && p > 0 ? 1 : 0)} ${units[p]}`
}

const countFormat = new Intl.NumberFormat()
export function formatCount(n = 0): string {
  return countFormat.format(n)
}

export function formatPercent(part: number, total: number): string {
  if (total <= 0) return '0%'
  const pct = (part / total) * 100
  if (pct > 0 && pct < 0.1) return '<0.1%'
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`
}

/** Drive-style short date: time today, "Yesterday", "Mar 4", or "Mar 4, 2024". */
export function formatDate(v?: string): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return '—'
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(v?: string): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function relativeTime(v?: string | null): string {
  if (!v) return 'never'
  const diff = Date.now() - new Date(v).getTime()
  if (Number.isNaN(diff)) return 'never'
  if (diff < 45_000) return 'just now'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function pathSegments(prefix: string): string[] {
  return prefix.split('/').filter(Boolean)
}

export function buildPrefix(parts: string[], idx: number): string {
  return parts.slice(0, idx + 1).join('/') + '/'
}

/** "a/b/" → "a / b", "" → "My Drive". */
export function folderLabel(prefix: string): string {
  const parts = pathSegments(prefix)
  return parts.length ? parts.join(' / ') : 'My Drive'
}

export function parentOf(key: string): string {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key
  const i = trimmed.lastIndexOf('/')
  return i < 0 ? '' : trimmed.slice(0, i + 1)
}

export function baseName(key: string): string {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || key
}

/** Folders first (like Drive), then the chosen order. */
export function sortItems(items: DriveItem[], field: SortField, dir: SortDir): DriveItem[] {
  const factor = dir === 'asc' ? 1 : -1
  const byName = (a: DriveItem, b: DriveItem) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    if (a.kind === 'file' && b.kind === 'file') {
      if (field === 'size' && a.size !== b.size) return (a.size - b.size) * factor
      if (field === 'modified') {
        const diff = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime()
        if (diff !== 0) return diff * factor
      }
    }
    return byName(a, b) * (field === 'name' ? factor : 1)
  })
}

const iconByExt: Record<string, { icon: string; className: string }> = {}
const groups: Array<[string[], string, string]> = [
  [['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'avif', 'tif', 'tiff'], 'image', 'file-image'],
  [['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'wmv', 'ts', 'mpg', 'mpeg'], 'movie', 'file-video'],
  [['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus'], 'audio_file', 'file-audio'],
  [['doc', 'docx', 'txt', 'rtf', 'md', 'odt', 'pages'], 'description', 'file-doc'],
  [['xls', 'xlsx', 'csv', 'ods', 'numbers'], 'table_chart', 'file-sheet'],
  [['ppt', 'pptx', 'odp', 'key'], 'slideshow', 'file-pdf'],
  [['pdf'], 'picture_as_pdf', 'file-pdf'],
  [['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso', 'dmg'], 'folder_zip', 'file-zip'],
  [['js', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'cs', 'rb', 'php', 'html', 'css', 'xml', 'sh'], 'code', 'file-code'],
  [['json'], 'data_object', 'file-code'],
  [['sql'], 'database', 'file-code'],
  [['yaml', 'yml', 'toml', 'ini', 'env'], 'settings', 'file-code'],
]
for (const [exts, icon, className] of groups) {
  for (const ext of exts) iconByExt[ext] = { icon, className }
}

export function getFileIcon(name: string): { icon: string; className: string } {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return iconByExt[ext] ?? { icon: 'draft', className: 'file-default' }
}

export const categoryMeta: Record<Category, { label: string; color: string; icon: string }> = {
  video: { label: 'Videos', color: 'var(--color-cat-video)', icon: 'movie' },
  image: { label: 'Images', color: 'var(--color-cat-image)', icon: 'image' },
  audio: { label: 'Audio', color: 'var(--color-cat-audio)', icon: 'audio_file' },
  document: { label: 'Documents', color: 'var(--color-cat-document)', icon: 'description' },
  archive: { label: 'Archives', color: 'var(--color-cat-archive)', icon: 'folder_zip' },
  code: { label: 'Code & data', color: 'var(--color-cat-code)', icon: 'code' },
  other: { label: 'Other', color: 'var(--color-cat-other)', icon: 'draft' },
}

/** Fixed category order: colours are validated for these neighbours, so stacks never re-order. */
export const categoryOrder: Category[] = ['video', 'image', 'audio', 'document', 'archive', 'code', 'other']

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
