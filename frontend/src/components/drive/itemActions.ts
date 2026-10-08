import { getFileIcon } from '../../lib'
import type { DriveItem } from '../../types'
import type { MenuItem } from '../ui/Menu'

export type ItemActions = {
  onOpen: (item: DriveItem) => void
  onDownload?: (item: DriveItem) => void
  onDelete?: (item: DriveItem) => void
  onOpenLocation?: (item: DriveItem) => void
}

export function itemIcon(item: DriveItem) {
  return item.kind === 'folder' ? { icon: 'folder', className: 'file-folder filled' } : getFileIcon(item.name)
}

export function menuItems(item: DriveItem, actions: ItemActions): MenuItem[] {
  const items: MenuItem[] = [
    { label: item.kind === 'folder' ? 'Open' : 'Preview', icon: item.kind === 'folder' ? 'folder_open' : 'visibility', onSelect: () => actions.onOpen(item) },
  ]
  if (item.kind === 'file' && actions.onDownload) items.push({ label: 'Download', icon: 'download', onSelect: () => actions.onDownload!(item) })
  if (item.location !== undefined && actions.onOpenLocation) {
    items.push({ label: 'Show file location', icon: 'drive_file_move', onSelect: () => actions.onOpenLocation!(item) })
  }
  if (actions.onDelete) items.push('divider', { label: 'Delete', icon: 'delete', danger: true, onSelect: () => actions.onDelete!(item) })
  return items
}
