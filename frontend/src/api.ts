import axios, { type AxiosProgressEvent } from 'axios'
import type {
  ActiveConnection,
  AnalyticsFilesPage,
  AnalyticsFilesQuery,
  AnalyticsResponse,
  AppSettings,
  ConnectionInput,
  ConnectionsList,
  DriveListData,
  DriveStats,
  ManagedUser,
  PresignedRequest,
  ScanStatus,
  SearchResult,
  User,
  UserPermissions,
} from './types'

const baseURL = (localStorage.getItem('ps_base_url') || import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const client = axios.create({ baseURL, withCredentials: true })

let onUnauthorized: (() => void) | null = null

/** Registers the handler for an expired or revoked session (any 401 outside the login call). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string = err?.config?.url ?? ''
    if (err?.response?.status === 401 && !url.startsWith('/api/auth/')) {
      onUnauthorized?.()
    }
    return Promise.reject(err)
  },
)

/** A readable message for any error thrown by this module. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isCancel(err)) return 'Cancelled'
  if (axios.isAxiosError(err)) {
    const data = err.response?.data
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return capitalize(data.error)
    if (typeof data === 'string' && data.trim()) return capitalize(data.trim())
    if (!err.response) return 'Network error: check your connection'
    return err.message || fallback
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export function isAbortError(err: unknown): boolean {
  return axios.isCancel(err) || (err instanceof DOMException && err.name === 'AbortError')
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Auth

export async function login(username: string, password: string): Promise<User> {
  const res = await client.post('/api/auth/login', { username, password })
  return res.data.user as User
}

export async function logout(): Promise<void> {
  await client.post('/api/auth/logout')
}

export async function getMe(): Promise<{ authenticated: boolean; user?: User }> {
  const res = await client.get('/api/auth/me')
  return res.data
}

// Drive

export async function listDrive(prefix: string, continuationToken?: string, signal?: AbortSignal): Promise<DriveListData> {
  const res = await client.get('/api/drive/list', { params: { prefix, limit: 500, continuationToken }, signal })
  return res.data.data as DriveListData
}

export async function searchDrive(q: string, signal?: AbortSignal): Promise<SearchResult> {
  const res = await client.get('/api/drive/search', { params: { q, limit: 300 }, signal })
  return res.data as SearchResult
}

export async function getDriveStats(signal?: AbortSignal): Promise<DriveStats> {
  const res = await client.get('/api/drive/stats', { signal })
  return res.data as DriveStats
}

export async function presignUpload(key: string, contentType: string): Promise<PresignedRequest> {
  const res = await client.post('/api/drive/presign/upload', { key, contentType })
  return res.data.upload as PresignedRequest
}

export async function presignDownload(key: string, asAttachment: boolean): Promise<PresignedRequest> {
  const res = await client.get('/api/drive/presign/download', { params: { key, download: asAttachment ? 1 : undefined } })
  return res.data.download as PresignedRequest
}

/** Uploads straight to storage with a presigned URL (the file never passes through the server). */
export async function uploadFile(
  key: string,
  file: Blob,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const contentType = file.type || 'application/octet-stream'
  const signed = await presignUpload(key, contentType)
  // Browsers forbid setting Host; it's sent automatically
  const headers = Object.fromEntries(Object.entries(signed.headers ?? {}).filter(([name]) => name.toLowerCase() !== 'host'))
  await axios.request({
    url: signed.url,
    method: signed.method || 'PUT',
    data: file,
    headers: { ...headers, 'Content-Type': contentType },
    signal,
    onUploadProgress: (e: AxiosProgressEvent) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
}

export async function createFolder(prefix: string, name: string): Promise<void> {
  await uploadFile(`${prefix}${name}/`, new Blob([], { type: 'application/x-directory' }))
}

export async function deleteObjects(keys: string[]): Promise<void> {
  await client.post('/api/bulk-objects-delete', { keys })
}

// Analytics

export async function getAnalytics(signal?: AbortSignal): Promise<AnalyticsResponse> {
  const res = await client.get('/api/analytics', { signal })
  return res.data as AnalyticsResponse
}

export async function startScan(): Promise<ScanStatus> {
  const res = await client.post('/api/analytics/scan')
  return res.data.status as ScanStatus
}

export async function cancelScan(): Promise<ScanStatus> {
  const res = await client.post('/api/analytics/scan/cancel')
  return res.data.status as ScanStatus
}

export async function getAnalyticsFiles(query: AnalyticsFilesQuery, signal?: AbortSignal): Promise<AnalyticsFilesPage> {
  const params: Record<string, string | number> = {
    sort: query.sort,
    order: query.order,
    offset: query.offset,
    limit: query.limit,
  }
  if (query.category) params.category = query.category
  if (query.q?.trim()) params.q = query.q.trim()
  if (query.minSize) params.minSize = query.minSize
  if (query.folder) params.folder = query.folder
  const res = await client.get('/api/analytics/files', { params, signal })
  return res.data as AnalyticsFilesPage
}

// Connections

export async function getConnections(): Promise<ConnectionsList> {
  const res = await client.get('/api/connections')
  return res.data as ConnectionsList
}

export async function getActiveConnection(): Promise<ActiveConnection | null> {
  const res = await client.get('/api/connections/active')
  return (res.data?.connection ?? null) as ActiveConnection | null
}

export async function saveConnection(conn: ConnectionInput): Promise<ConnectionsList> {
  const res = await client.post('/api/connections', conn)
  return res.data as ConnectionsList
}

export async function switchConnection(id: string): Promise<void> {
  await client.post('/api/connections/switch', { id })
}

export async function deleteConnection(id: string): Promise<ConnectionsList> {
  const res = await client.delete(`/api/connections/${encodeURIComponent(id)}`)
  return res.data as ConnectionsList
}

// Settings & users

export async function getSettings(): Promise<AppSettings> {
  const res = await client.get('/api/settings')
  return res.data as AppSettings
}

export async function updateSettings(payload: AppSettings): Promise<AppSettings> {
  const res = await client.put('/api/settings', { sftpEnabled: payload.sftpEnabled, sftpAddr: payload.sftpAddr })
  return res.data as AppSettings
}

export async function listUsers(): Promise<ManagedUser[]> {
  const res = await client.get('/api/users')
  return (res.data?.users ?? []) as ManagedUser[]
}

export async function createUser(username: string, password: string): Promise<ManagedUser> {
  const res = await client.post('/api/users', { username, password })
  return res.data.user as ManagedUser
}

export async function updateUserPermissions(userId: number, permissions: UserPermissions): Promise<ManagedUser> {
  const res = await client.put(`/api/users/${userId}/permissions`, permissions)
  return res.data.user as ManagedUser
}

export async function updateUserActive(userId: number, isActive: boolean): Promise<ManagedUser> {
  const res = await client.put(`/api/users/${userId}/active`, { isActive })
  return res.data.user as ManagedUser
}

export async function resetUserPassword(userId: number, password: string): Promise<void> {
  await client.put(`/api/users/${userId}/password`, { password })
}

export async function deleteUser(userId: number): Promise<void> {
  await client.delete(`/api/users/${userId}`)
}
