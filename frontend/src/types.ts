export type User = {
  id?: number
  username: string
  role?: 'owner' | 'user'
  permissions?: UserPermissions
}

export type UserPermissions = {
  canReadFiles: boolean
  canWriteFiles: boolean
  canManageConnections: boolean
  canManageSettings: boolean
  canUseSftp: boolean
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
  size?: number
  lastModified?: string
  itemCount?: number
}

export type FileInfo = {
  key: string
  name: string
  size: number
  lastModified: string
  eTag?: string
}

export type DriveListData = {
  currentPrefix: string
  parentPrefix: string
  folders: FolderInfo[]
  files: FileInfo[]
  isTruncated: boolean
  nextContinuationToken?: string
}

export type DriveListResponse = {
  data: DriveListData
}

export type PresignedRequest = {
  url: string
  method: string
  headers?: Record<string, string>
  expiresAt?: string
}

export type Connection = {
  id: string
  name: string
  bucket: string
  region: string
  endpoint?: string
  accessKey: string
  secretKey: string
  usePathStyle: boolean
}

export type ConnectionsList = {
  connections: Connection[]
  activeId: string
}

export type AppSettings = {
  sftpEnabled: boolean
  sftpAddr: string
}

export type UpdateAppSettings = {
  sftpEnabled: boolean
  sftpAddr: string
}

export type CreateUserPayload = {
  username: string
  password: string
}

export type ConnectionMigrationMode = 'copy' | 'move'
export type ConnectionMigrationConflictPolicy = 'skip' | 'overwrite' | 'fail'

export type ConnectionMigrationRequest = {
  sourceConnectionId: string
  destinationConnectionId: string
  prefixFilter: string
  mode: ConnectionMigrationMode
  conflictPolicy: ConnectionMigrationConflictPolicy
}

export type ConnectionMigrationDryRun = {
  scannedObjects: number
  bytes: number
}

export type ConnectionMigrationJob = {
  id: number
  createdByUserId: number
  sourceConnectionId: string
  destinationConnectionId: string
  prefixFilter: string
  mode: ConnectionMigrationMode
  conflictPolicy: ConnectionMigrationConflictPolicy
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  dryRunScannedObjects: number
  dryRunBytes: number
  scannedObjects: number
  migratedObjects: number
  failedObjects: number
  bytesDone: number
  errorSummary: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  updatedAt: string
}

export type ConnectionMigrationJobError = {
  objectKey: string
  errorMessage: string
  createdAt: string
}
