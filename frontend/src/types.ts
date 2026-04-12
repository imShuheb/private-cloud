export type User = {
  username: string
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
