import type { FileInfo, FolderInfo } from './types'

export const sortOptions = [
  { label: 'Name A–Z', value: 'name-asc' },
  { label: 'Name Z–A', value: 'name-desc' },
  { label: 'Size ↓', value: 'size-desc' },
  { label: 'Size ↑', value: 'size-asc' },
  { label: 'Newest first', value: 'date-desc' },
  { label: 'Oldest first', value: 'date-asc' },
] as const

export function formatBytes(size = 0): string {
  if (size <= 0) return '–'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const p = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / Math.pow(1024, p)
  return `${value.toFixed(value < 10 && p > 0 ? 1 : 0)} ${units[p]}`
}

export function formatDate(v?: string): string {
  if (!v) return '–'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '–'

  const now = new Date()
  const diff = now.getTime() - d.getTime()

  // Less than a minute
  if (diff < 60_000) return 'Just now'
  // Less then an hour
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`
  // Same day
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  // Yesterday
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  }
  // Same year
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function pathSegments(prefix: string): string[] {
  return prefix.split('/').filter(Boolean)
}

export function buildPrefix(parts: string[], idx: number): string {
  return parts.slice(0, idx + 1).join('/') + '/'
}

export function filterFolders(items: FolderInfo[], query: string, sortBy?: string): FolderInfo[] {
  const q = query.trim().toLowerCase()
  const list = items.filter((f) => !q || f.name.toLowerCase().includes(q))
  
  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name))
  if (sortBy?.endsWith('-desc')) {
    return sorted.reverse()
  }
  return sorted
}

export function filterSortFiles(items: FileInfo[], query: string, sortBy: string): FileInfo[] {
  const q = query.trim().toLowerCase()
  const list = items.filter((f) => !q || (f.name || f.key).toLowerCase().includes(q))

  const byName = (a: FileInfo, b: FileInfo) => (a.name || a.key).localeCompare(b.name || b.key)
  const bySize = (a: FileInfo, b: FileInfo) => (a.size || 0) - (b.size || 0)
  const byDate = (a: FileInfo, b: FileInfo) => new Date(a.lastModified || 0).getTime() - new Date(b.lastModified || 0).getTime()

  let sorted = [...list]
  const [field, direction] = sortBy.split('-')

  switch (field) {
    case 'size':
      sorted.sort(bySize)
      break
    case 'date':
      sorted.sort(byDate)
      break
    default:
      sorted.sort(byName)
  }

  if (direction === 'desc') {
    sorted.reverse()
  }

  return sorted
}

/** Return the Material Symbol icon name & CSS modifier class for a file extension */
export function getFileIcon(name: string): { icon: string; className: string } {
  const ext = name.split('.').pop()?.toLowerCase() || ''

  const map: Record<string, { icon: string; className: string }> = {
    // Images
    jpg: { icon: 'image', className: 'file-icon-img' },
    jpeg: { icon: 'image', className: 'file-icon-img' },
    png: { icon: 'image', className: 'file-icon-img' },
    gif: { icon: 'gif_box', className: 'file-icon-img' },
    webp: { icon: 'image', className: 'file-icon-img' },
    svg: { icon: 'image', className: 'file-icon-img' },
    bmp: { icon: 'image', className: 'file-icon-img' },
    ico: { icon: 'image', className: 'file-icon-img' },
    // Video
    mp4: { icon: 'movie', className: 'file-icon-video' },
    mkv: { icon: 'movie', className: 'file-icon-video' },
    avi: { icon: 'movie', className: 'file-icon-video' },
    mov: { icon: 'movie', className: 'file-icon-video' },
    webm: { icon: 'movie', className: 'file-icon-video' },
    // Audio
    mp3: { icon: 'audio_file', className: 'file-icon-audio' },
    wav: { icon: 'audio_file', className: 'file-icon-audio' },
    flac: { icon: 'audio_file', className: 'file-icon-audio' },
    ogg: { icon: 'audio_file', className: 'file-icon-audio' },
    // Documents
    doc: { icon: 'description', className: 'file-icon-doc' },
    docx: { icon: 'description', className: 'file-icon-doc' },
    txt: { icon: 'description', className: 'file-icon-doc' },
    rtf: { icon: 'description', className: 'file-icon-doc' },
    md: { icon: 'description', className: 'file-icon-doc' },
    // Spreadsheets
    xls: { icon: 'table_chart', className: 'file-icon-sheet' },
    xlsx: { icon: 'table_chart', className: 'file-icon-sheet' },
    csv: { icon: 'table_chart', className: 'file-icon-sheet' },
    // PDF
    pdf: { icon: 'picture_as_pdf', className: 'file-icon-pdf' },
    // Archives
    zip: { icon: 'folder_zip', className: 'file-icon-zip' },
    rar: { icon: 'folder_zip', className: 'file-icon-zip' },
    '7z': { icon: 'folder_zip', className: 'file-icon-zip' },
    tar: { icon: 'folder_zip', className: 'file-icon-zip' },
    gz: { icon: 'folder_zip', className: 'file-icon-zip' },
    // Code
    js: { icon: 'code', className: 'file-icon-code' },
    ts: { icon: 'code', className: 'file-icon-code' },
    jsx: { icon: 'code', className: 'file-icon-code' },
    tsx: { icon: 'code', className: 'file-icon-code' },
    py: { icon: 'code', className: 'file-icon-code' },
    go: { icon: 'code', className: 'file-icon-code' },
    rs: { icon: 'code', className: 'file-icon-code' },
    java: { icon: 'code', className: 'file-icon-code' },
    json: { icon: 'data_object', className: 'file-icon-code' },
    xml: { icon: 'code', className: 'file-icon-code' },
    html: { icon: 'code', className: 'file-icon-code' },
    css: { icon: 'code', className: 'file-icon-code' },
    sql: { icon: 'database', className: 'file-icon-code' },
    yaml: { icon: 'settings', className: 'file-icon-code' },
    yml: { icon: 'settings', className: 'file-icon-code' },
    toml: { icon: 'settings', className: 'file-icon-code' },
  }

  return map[ext] || { icon: 'draft', className: 'file-icon-default' }
}
