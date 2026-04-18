import axios from 'axios'
import type {
  DriveListResponse,
  PresignedRequest,
  User,
  ManagedUser,
  UserPermissions,
  CreateUserPayload,
  ConnectionsList,
  Connection,
  AppSettings,
  UpdateAppSettings,
  ConnectionMigrationRequest,
  ConnectionMigrationDryRun,
  ConnectionMigrationJob,
  ConnectionMigrationJobError,
} from './types'

const defaultBase = import.meta.env.VITE_API_BASE ?? ''
const localBase = localStorage.getItem('ps_base_url') ?? ''

const client = axios.create({
  baseURL: localBase || defaultBase,
  withCredentials: true,
})

export async function getConnections(): Promise<ConnectionsList> {
  const res = await client.get('/api/connections')
  return res.data as ConnectionsList
}

export async function switchConnection(id: string): Promise<void> {
  await client.post('/api/connections/switch', { id })
}

export async function addConnection(conn: Connection): Promise<void> {
  await client.post('/api/connections', conn)
}

export async function deleteConnection(id: string): Promise<void> {
  await client.delete(`/api/connections/${encodeURIComponent(id)}`)
}

export async function login(username: string, password: string): Promise<User> {
  const res = await client.post('/api/auth/login', { username, password })
  return res.data.user as User
}

export async function logout(): Promise<void> {
  await client.post('/api/auth/logout')
}

export async function getMe(): Promise<{ authenticated: boolean; user?: User }> {
  const res = await client.get('/api/auth/me')
  return res.data as { authenticated: boolean; user?: User }
}

export async function listDrive(prefix = '', limit = 300) {
  const res = await client.get('/api/drive/list', { params: { prefix, limit } })
  return (res.data as DriveListResponse).data
}

export async function presignUpload(key: string, contentType: string): Promise<PresignedRequest> {
  const res = await client.post('/api/drive/presign/upload', {
    key,
    contentType,
  })
  return res.data.upload as PresignedRequest
}

export async function presignDownload(key: string): Promise<PresignedRequest> {
  const res = await client.get('/api/drive/presign/download', { params: { key } })
  return res.data.download as PresignedRequest
}

export function objectDownloadUrl(key: string): string {
  const safeKey = encodeURI(key)
  const path = `/api/objects/${safeKey}`

  const base = (localBase || defaultBase || '').trim()
  if (!base) return path

  return `${base.replace(/\/$/, '')}${path}`
}

export async function deleteObject(key: string): Promise<void> {
  await client.delete(`/api/objects/${encodeURI(key)}`)
}

export async function deleteObjects(keys: string[]): Promise<void> {
  await client.post('/api/bulk-objects-delete', { keys })
}

export async function getDriveStats() {
  const res = await client.get('/api/drive/stats')
  return res.data as { 
    totalSize: number; 
    totalFiles: number; 
    totalFolders: number;
    isConfigured: boolean;
  }
}

export async function listAll(prefix = '', limit = 1000) {
  const res = await client.get('/api/objects', { params: { prefix, limit } })
  return res.data.items as any[]
}

export async function getSettings(): Promise<AppSettings> {
  const res = await client.get('/api/settings')
  return res.data as AppSettings
}

export async function updateSettings(payload: UpdateAppSettings): Promise<AppSettings> {
  const body = {
    sftpEnabled: payload.sftpEnabled,
    sftpAddr: payload.sftpAddr,
  }
  const res = await client.put('/api/settings', body)
  return res.data as AppSettings
}

export async function listUsers(): Promise<ManagedUser[]> {
  const res = await client.get('/api/users')
  return (res.data?.users ?? []) as ManagedUser[]
}

export async function createUser(payload: CreateUserPayload): Promise<ManagedUser> {
  const res = await client.post('/api/users', payload)
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

export async function migrationDryRun(payload: ConnectionMigrationRequest): Promise<ConnectionMigrationDryRun> {
  const res = await client.post('/api/migrations/connections/dry-run', payload)
  return res.data?.dryRun as ConnectionMigrationDryRun
}

export async function migrationStart(payload: ConnectionMigrationRequest): Promise<{ jobId: number }> {
  const res = await client.post('/api/migrations/connections/start', payload)
  return { jobId: Number(res.data?.jobId || 0) }
}

export async function migrationStatus(jobId: number): Promise<{ job: ConnectionMigrationJob; errors: ConnectionMigrationJobError[] }> {
  const res = await client.get(`/api/migrations/connections/${jobId}`)
  return {
    job: res.data?.job as ConnectionMigrationJob,
    errors: (res.data?.errors ?? []) as ConnectionMigrationJobError[],
  }
}

export async function migrationCancel(jobId: number): Promise<void> {
  await client.post(`/api/migrations/connections/${jobId}/cancel`)
}

export async function migrationRetryFailed(jobId: number): Promise<void> {
  await client.post(`/api/migrations/connections/${jobId}/retry-failed`)
}
