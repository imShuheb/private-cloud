export type UserPermissions = {
  canReadFiles: boolean
  canWriteFiles: boolean
  canManageConnections: boolean
  canManageSettings: boolean
  canUseSftp: boolean
}

export type User = {
  id?: number
  username: string
  role?: 'owner' | 'user'
  permissions?: UserPermissions
}

export type ManagedUser = {
  id: number
  username: string
  role: 'owner' | 'user'
  isActive: boolean
  createdAt: string
  updatedAt: string
  permissions: UserPermissions
}

export type FolderInfo = {
  prefix: string
  name: string
}

export type FileInfo = {
  key: string
  name: string
  size: number
  lastModified: string
  etag?: string
}

/** A row in the drive list: either a folder or a file, with an optional location for search results. */
export type DriveItem =
  | { kind: 'folder'; key: string; name: string; location?: string }
  | { kind: 'file'; key: string; name: string; size: number; lastModified: string; location?: string }

export type DriveListData = {
  currentPrefix: string
  parentPrefix?: string
  folders: FolderInfo[]
  files: FileInfo[]
  isTruncated: boolean
  nextContinuationToken?: string
}

export type PresignedRequest = {
  url: string
  method: string
  headers?: Record<string, string>
  expiresAt?: string
}

/** A connection as returned by the API: keys are never sent back. */
export type Connection = {
  id: string
  name: string
  bucket: string
  region: string
  endpoint?: string
  usePathStyle: boolean
  accessKeyHint?: string
}

/** Payload for creating or updating a connection; blank keys keep the stored ones on edit. */
export type ConnectionInput = Omit<Connection, 'accessKeyHint'> & {
  accessKey: string
  secretKey: string
}

export type ConnectionsList = {
  connections: Connection[]
  activeId: string
}

export type ActiveConnection = {
  id: string
  name: string
  bucket: string
}

export type AppSettings = {
  sftpEnabled: boolean
  sftpAddr: string
}

export type DriveStats = {
  totalSize: number
  totalFiles: number
  totalFolders: number
  isConfigured: boolean
  scanning: boolean
  scannedAt?: string | null
}

export type SearchResult = {
  items: FileInfo[]
  truncated: boolean
}

// Analytics

export type Category = 'video' | 'image' | 'audio' | 'document' | 'archive' | 'code' | 'other'

export type ScanState = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'

export type ScanStatus = {
  connectionId: string
  state: ScanState
  startedAt?: string
  finishedAt?: string
  scannedObjects: number
  scannedBytes: number
  error?: string
  reportAt?: string
}

export type UsageBucket = {
  key: string
  label: string
  count: number
  bytes: number
}

export type FolderUsage = {
  prefix: string
  files: number
  bytes: number
}

export type AnalyticsFile = {
  key: string
  name: string
  folder: string
  extension: string
  category: Category
  size: number
  lastModified: string
}

export type DuplicateGroup = {
  size: number
  count: number
  wastedBytes: number
  keys: string[]
}

export type AnalyticsReport = {
  generatedAt: string
  totalFiles: number
  totalFolders: number
  totalBytes: number
  largestFile?: AnalyticsFile
  byCategory: UsageBucket[] | null
  byExtension: UsageBucket[] | null
  sizeDistribution: UsageBucket[]
  ageDistribution: UsageBucket[]
  topFolders: FolderUsage[] | null
  rootFolders: FolderUsage[] | null
  duplicates: DuplicateGroup[] | null
  duplicateWastedBytes: number
}

export type AnalyticsResponse = {
  bucket: string
  status: ScanStatus
  report: AnalyticsReport | null
  maxLargestFiles: number
  largestFilesCount?: number
}

export type FileSort = 'size' | 'name' | 'modified' | 'type'

export type AnalyticsFilesQuery = {
  sort: FileSort
  order: 'asc' | 'desc'
  category?: Category | ''
  q?: string
  minSize?: number
  folder?: string
  offset: number
  limit: number
}

export type AnalyticsFilesPage = {
  items: AnalyticsFile[]
  total: number
  offset: number
}
