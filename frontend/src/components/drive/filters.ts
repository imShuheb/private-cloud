import { fileCategory, inModifiedRange, type ModifiedRange } from '../../lib'
import type { Category, DriveItem } from '../../types'

export type TypeFilter = '' | 'folder' | Category

export type DriveFilters = { type: TypeFilter; modified: ModifiedRange }

export const noFilters: DriveFilters = { type: '', modified: '' }

export function hasFilters(f: DriveFilters): boolean {
  return f.type !== '' || f.modified !== ''
}

/** Folders have no date in S3, so a date filter hides them. */
export function matchesFilters(item: DriveItem, f: DriveFilters): boolean {
  if (f.type === 'folder' && item.kind !== 'folder') return false
  if (f.type && f.type !== 'folder' && (item.kind !== 'file' || fileCategory(item.name) !== f.type)) return false
  if (f.modified && (item.kind !== 'file' || !inModifiedRange(item.lastModified, f.modified))) return false
  return true
}
