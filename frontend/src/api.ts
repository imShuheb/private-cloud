import axios from 'axios'
import type {
  DriveListResponse,
  PresignedRequest,
  User,
  ConnectionsList,
  Connection
} from './types'

export async function getConnections(): Promise<ConnectionsList> {
  const res = await client.get('/api/connections')
  return res.data
}

export async function switchConnection(id: string): Promise<void> {
  const res = await fetch('/api/connections/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error('Failed to switch connection')
}

export async function addConnection(conn: Connection): Promise<void> {
  await client.post('/api/connections', conn)
}

const defaultBase = import.meta.env.VITE_API_BASE ?? ''
const localBase = localStorage.getItem('ps_base_url') ?? ''

const client = axios.create({
  baseURL: localBase || defaultBase,
  withCredentials: true,
})

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

export async function listJobs(limit = 50) {
  const res = await client.get('/api/jobs', { params: { limit } })
  return res.data
}

export async function getJob(id: string) {
  const res = await client.get(`/api/jobs/${id}`)
  return res.data
}

export async function getAnalyticsSnapshot() {
  const res = await client.get('/api/analytics/snapshot')
  return res.data
}

export async function getPricing() {
  const res = await client.get('/api/analytics/pricing')
  return res.data
}

export async function updatePricing(config: any) {
  const res = await client.post('/api/analytics/pricing', config)
  return res.data
}

export async function triggerInventoryScan(manifestKey?: string) {
  const res = await client.post('/api/analytics/trigger-scan', { manifestKey })
  return res.data
}
