import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { deleteObject, deleteObjects, listDrive, listAll, logout, presignDownload, presignUpload, getDriveStats, objectDownloadUrl } from '../api'
import { pathSegments } from '../lib'
import type { FileInfo, DriveListData, User } from '../types'

import Header from '../components/layout/Header'
import Sidebar from '../components/layout/Sidebar'
import Toolbar from '../components/drive/Toolbar'
import NewMenu from '../components/drive/NewMenu'
import FileList from '../components/drive/FileList'
import StatusBar from '../components/drive/StatusBar'
import { filterFolders, filterSortFiles } from '../lib'
import UploadTray, { type UploadStatus } from '../components/drive/UploadTray'
import ConfirmModal from '../components/drive/ConfirmModal'
import axios from 'axios'

type Props = {
  user: User
  onLogout: () => void
}

export default function DrivePage({ user, onLogout }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [data, setData] = useState<DriveListData | null>(null)

  // Prefix is derived from the URL path: /drive/some/folder -> "some/folder/"
  const prefix = useMemo(() => {
    const p = pathname.replace(/^\/drive\/?/, '')
    if (!p) return ''
    return p.endsWith('/') ? p : p + '/'
  }, [pathname])

  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Storage active')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('name-asc')
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [activeUploads, setActiveUploads] = useState<UploadStatus[]>([])
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    isDangerous?: boolean
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { } })
  const [stats, setStats] = useState({ totalSize: 0, totalFiles: 0, totalFolders: 0, isConfigured: false })
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const parentPrefix = data?.parentPrefix || ''

  const segments = useMemo(() => pathSegments(prefix), [prefix])
  const isSearching = !!(query.trim() && searchResults)

  const folders = useMemo(() => {
    let list: any[] = []
    if (isSearching && searchResults) {
      list = searchResults
        .filter(item => item.key.endsWith('/'))
        .map(item => ({
          ...item,
          prefix: item.key,
          name: item.key.split('/').filter(Boolean).pop() || item.key
        }))
    } else {
      list = data?.folders || []
    }
    return filterFolders(list, query)
  }, [data, query, searchResults, isSearching])

  const files = useMemo(() => {
    let list: any[] = []
    if (isSearching && searchResults) {
      list = searchResults
        .filter(item => !item.key.endsWith('/'))
        .map(f => {
          const parts = f.key.split('/')
          const name = parts.pop() || f.key
          const location = parts.join(' / ')
          return { ...f, name, location }
        })
    } else {
      list = data?.files || []
    }
    return filterSortFiles(list, query, sortBy)
  }, [data, query, sortBy, searchResults, isSearching])


  const load = useCallback(async (nextPrefix = prefix) => {
    setLoading(true)
    setNotFound(false)
    try {
      const [res, driveStats] = await Promise.all([
        listDrive(nextPrefix),
        getDriveStats()
      ])
      setData(res)
      setStats(driveStats)
      setStatus(`${res.folders.length} folders, ${res.files.length} files synchronized`)
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setNotFound(true)
        setStatus('Folder not found')
      } else {
        setStatus(err?.response?.data?.error || err?.message || 'Access failed')
      }
    } finally {
      setLoading(false)
      setStatsLoaded(true)
    }
  }, [prefix])

  const navigateTo = useCallback((nextPrefix: string) => {
    setQuery('')
    setSearchResults(null)
    setSelectedKeys(new Set())
    const sanitized = nextPrefix.replace(/^\/+/, '')
    navigate(`/drive/${sanitized}`)
  }, [navigate])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return

    setLoading(true)
    const fileArray = Array.from(files)
    const total = fileArray.length

    const initialUploads: UploadStatus[] = fileArray.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: (f as any).webkitRelativePath || f.name,
      progress: 0,
      status: 'uploading'
    }))
    setActiveUploads(prev => [...prev, ...initialUploads])

    try {
      const uploadFile = async (file: File, index: number) => {
        const uploadId = initialUploads[index].id
        const relativePath = (file as any).webkitRelativePath
        const name = relativePath || file.name
        const key = `${prefix}${name}`

        try {
          const signed = await presignUpload(key, file.type || 'application/octet-stream')

          await axios.put(signed.url, file, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              ...(signed.headers || {})
            },
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1))
              setActiveUploads(prev => prev.map(u =>
                u.id === uploadId ? { ...u, progress: percentCompleted } : u
              ))
            }
          })

          setActiveUploads(prev => prev.map(u =>
            u.id === uploadId ? { ...u, progress: 100, status: 'completed' } : u
          ))
        } catch (e: any) {
          setActiveUploads(prev => prev.map(u =>
            u.id === uploadId ? { ...u, status: 'error', error: e.message } : u
          ))
          throw e
        }
      }

      // Concurrency limit: 3 files at a time
      for (let i = 0; i < fileArray.length; i += 3) {
        const chunk = fileArray.slice(i, i + 3)
        await Promise.all(chunk.map((f, idx) => uploadFile(f, i + idx)))
      }

      if (fileRef.current) fileRef.current.value = ''
      if (folderRef.current) folderRef.current.value = ''
      setShowNewMenu(false)
      await load(prefix)
      const newStats = await getDriveStats()
      setStats(newStats)
      setStatus(`Successfully uploaded ${total} items`)
    } catch (err: any) {
      setStatus(err?.message || 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateFolder() {
    const folderName = newFolder.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
    if (!folderName) {
      setStatus('Folder name is required')
      return
    }

    setLoading(true)
    try {
      const key = `${prefix}${folderName}/`
      const signed = await presignUpload(key, 'application/x-directory')
      const res = await fetch(signed.url, {
        method: signed.method || 'PUT',
        headers: signed.headers || {},
        body: new Blob([]),
      })
      if (!res.ok) throw new Error(await res.text())
      setNewFolder('')
      setShowNewMenu(false)
      await load(prefix)
      setStatus(`Folder "${folderName}" created successfully`)
    } catch (err: any) {
      setStatus(err?.message || 'Folder creation failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleBulkDelete() {
    if (selectedKeys.size === 0) return

    setConfirmState({
      isOpen: true,
      title: 'Delete multiple items',
      message: `Are you sure you want to permanently delete ${selectedKeys.size} selected items? This action cannot be undone.`,
      isDangerous: true,
      onConfirm: async () => {
        setLoading(true)
        try {
          await deleteObjects(Array.from(selectedKeys))
          setSelectedKeys(new Set())
          await load(prefix)
          setStatus(`Successfully deleted items`)
        } catch (err: any) {
          setStatus(err?.message || 'Bulk delete operation failed')
        } finally {
          setLoading(false)
        }
      }
    })
  }

  async function handlePreview(file: FileInfo) {
    try {
      const signed = await presignDownload(file.key)
      window.open(signed.url, '_blank', 'noopener')
      setStatus(`Opening preview for ${file.name}`)
    } catch (err: any) {
      setStatus(err?.message || 'Preview initialization failed')
    }
  }

  async function handleDownload(file: FileInfo) {
    try {
      const link = document.createElement('a')
      link.href = objectDownloadUrl(file.key)
      link.download = file.name || file.key.split('/').pop() || 'download'
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setStatus(`Downloading ${file.name}`)
    } catch (err: any) {
      setStatus(err?.message || 'Download failed')
    }
  }

  async function handleDelete(item: any) {
    const isFolder = !!item.prefix
    const name = isFolder ? item.name : (item.name || item.key)
    const key = isFolder ? item.prefix : item.key

    setConfirmState({
      isOpen: true,
      title: 'Delete item',
      message: `Are you sure you want to permanently delete "${name}"? This action cannot be undone.`,
      isDangerous: true,
      onConfirm: async () => {
        setLoading(true)
        try {
          await deleteObject(key)
          await load(prefix)
          setStatus(`Deleted ${name}`)
        } catch (err: any) {
          setStatus(err?.message || 'Delete operation failed')
        } finally {
          setLoading(false)
        }
      }
    })
  }

  async function doLogout() {
    try {
      await logout()
    } catch (e) {
    }
    onLogout()
    navigate('/login')
  }

  useEffect(() => {
    load(prefix)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSearchResults(null)
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const all = await listAll()
        setSearchResults(all)
        setStatus(`Universal search: found ${all.length} matches across drive`)
      } catch (e) {
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden selection:bg-black selection:text-white">
      <Header
        user={user}
        loading={loading}
        query={query}
        onQueryChange={setQuery}
        onRefresh={() => load(prefix)}
        onLogout={doLogout}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          onNewClick={() => setShowNewMenu(!showNewMenu)}
          filesCount={stats.totalFiles}
          foldersCount={stats.totalFolders}
          totalSize={stats.totalSize}
          isConfigured={stats.isConfigured}
          connectionsLoading={!statsLoaded}
        />

        <NewMenu
          isOpen={showNewMenu}
          onClose={() => setShowNewMenu(false)}
          newFolder={newFolder}
          onNewFolderChange={setNewFolder}
          onCreateFolder={handleCreateFolder}
          onUpload={handleUpload}
          loading={loading}
          fileRef={fileRef}
          folderRef={folderRef}
          folderInputRef={folderInputRef}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-white border-l border-gray-200 min-h-0 relative">
          {loading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-500 animate-pulse z-20" />
          )}
          <Toolbar
            segments={segments}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            onUpClick={() => navigateTo(parentPrefix)}
            onLoad={navigateTo}
            parentPrefix={parentPrefix}
            loading={loading}
            selectedCount={selectedKeys.size}
            onBulkDelete={handleBulkDelete}
          />

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            {loading && !data ? (
              <div className="p-4 md:p-6 space-y-3">
                <div className="h-10 border border-gray-200 bg-gray-50 animate-pulse" />
                <div className="h-10 border border-gray-200 bg-gray-50 animate-pulse" />
                <div className="h-10 border border-gray-200 bg-gray-50 animate-pulse" />
                <div className="h-10 border border-gray-200 bg-gray-50 animate-pulse" />
                <div className="h-10 border border-gray-200 bg-gray-50 animate-pulse" />
              </div>
            ) : notFound ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-24 h-24 border border-black flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-5xl text-black">folder_off</span>
                </div>
                <h2 className="text-xl font-bold text-black mb-2 uppercase tracking-wide">Folder Not Found</h2>
                <p className="text-gray-700 mb-8 max-w-xs">
                  This folder doesn't exist or has been moved.
                </p>
                <button
                  onClick={() => navigateTo('')}
                  className="px-6 py-2.5 bg-black text-white font-bold border border-black hover:bg-neutral-900"
                >
                  Back to My Drive
                </button>
              </div>
            ) : (
              <FileList
                folders={folders}
                files={files}
                onFolderClick={navigateTo}
                onPreview={handlePreview}
                onDownload={handleDownload}
                onDelete={handleDelete}
                isSearching={isSearching}
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              />
            )}
          </div>

          {loading && data && (
            <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] pointer-events-none flex items-start justify-center pt-14 z-10">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 shadow-sm text-xs font-semibold uppercase tracking-wider text-black">
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Loading
              </div>
            </div>
          )}
        </main>
      </div>

      <StatusBar
        loading={loading}
        status={status}
      />

      <UploadTray
        uploads={activeUploads}
        onClose={() => setActiveUploads([])}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        isDangerous={confirmState.isDangerous}
      />
    </div>
  )
}
