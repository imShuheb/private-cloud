import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createFolder, deleteObjects, errorMessage, isAbortError, presignDownload, searchDrive } from '../api'
import FileList from '../components/drive/FileList'
import NewMenu from '../components/drive/NewMenu'
import StatusBar from '../components/drive/StatusBar'
import Toolbar, { type ViewMode } from '../components/drive/Toolbar'
import UploadTray from '../components/drive/UploadTray'
import AppShell from '../components/layout/AppShell'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { permissionsOf, useUser } from '../context/auth'
import { useToast } from '../context/toast'
import { useActiveConnection } from '../hooks/useActiveConnection'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useDriveListing } from '../hooks/useDriveListing'
import { useUploads } from '../hooks/useUploads'
import { baseName, parentOf, pathSegments, sortItems, type SortDir, type SortField } from '../lib'
import type { DriveItem } from '../types'

type SearchState = { status: 'idle' | 'loading' | 'ready' | 'error'; items: DriveItem[]; truncated: boolean; error?: string }

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable (private mode); the preference just isn't remembered
  }
}

export default function DrivePage() {
  const user = useUser()
  const perms = permissionsOf(user)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const toast = useToast()

  // /drive/a/b → "a/b/"
  const prefix = useMemo(() => {
    const p = decodeURIComponent(pathname.replace(/^\/drive\/?/, ''))
    return p ? (p.endsWith('/') ? p : `${p}/`) : ''
  }, [pathname])

  const [view, setView] = useState<ViewMode>(() => readPref('ps_view', ['list', 'grid'] as const, 'list'))
  const [sortField, setSortField] = useState<SortField>(() => readPref('ps_sort', ['name', 'size', 'modified'] as const, 'name'))
  const [sortDir, setSortDir] = useState<SortDir>(() => readPref('ps_sort_dir', ['asc', 'desc'] as const, 'asc'))
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query.trim(), 350)
  const [search, setSearch] = useState<SearchState>({ status: 'idle', items: [], truncated: false })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newOpen, setNewOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DriveItem[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const activeConnection = useActiveConnection()
  const listing = useDriveListing(prefix, perms.canRead)
  const { reload } = listing
  const searching = debouncedQuery.length > 0

  const uploads = useUploads(
    useCallback(
      (uploaded: number) => {
        if (uploaded > 0) {
          reload()
          toast.show(`${uploaded} item${uploaded === 1 ? '' : 's'} uploaded`, { tone: 'success' })
        }
      },
      [reload, toast],
    ),
  )

  // A new folder or search starts with nothing selected
  useEffect(() => {
    setSelected(new Set())
  }, [prefix, debouncedQuery])

  useEffect(() => {
    if (!searching || !perms.canRead) {
      setSearch({ status: 'idle', items: [], truncated: false })
      return
    }
    const controller = new AbortController()
    setSearch((prev) => ({ ...prev, status: 'loading' }))
    searchDrive(debouncedQuery, controller.signal)
      .then((res) => {
        const items: DriveItem[] = res.items.map((obj) =>
          obj.key.endsWith('/')
            ? { kind: 'folder', key: obj.key, name: baseName(obj.key), location: parentOf(obj.key) }
            : { kind: 'file', key: obj.key, name: baseName(obj.key), size: obj.size, lastModified: obj.lastModified, location: parentOf(obj.key) },
        )
        setSearch({ status: 'ready', items, truncated: res.truncated })
      })
      .catch((err) => {
        if (isAbortError(err)) return
        setSearch({ status: 'error', items: [], truncated: false, error: errorMessage(err, 'Search failed') })
      })
    return () => controller.abort()
  }, [debouncedQuery, searching, perms.canRead])

  const items = useMemo(() => {
    const base: DriveItem[] = searching
      ? search.items
      : [
          ...listing.folders.map((f): DriveItem => ({ kind: 'folder', key: f.prefix, name: f.name })),
          ...listing.files.map((f): DriveItem => ({ kind: 'file', key: f.key, name: f.name || baseName(f.key), size: f.size, lastModified: f.lastModified })),
        ]
    return sortItems(base, sortField, sortDir)
  }, [searching, search.items, listing.folders, listing.files, sortField, sortDir])

  const goTo = useCallback(
    (next: string) => {
      setQuery('')
      navigate(`/drive/${next.split('/').map(encodeURIComponent).join('/')}`)
    },
    [navigate],
  )

  const preview = useCallback(
    async (item: DriveItem) => {
      // Open the tab synchronously so popup blockers allow it, then point it at the signed URL
      const tab = window.open('', '_blank')
      try {
        const signed = await presignDownload(item.key, false)
        if (tab) {
          tab.opener = null
          tab.location.href = signed.url
        } else {
          window.location.href = signed.url
        }
      } catch (err) {
        tab?.close()
        toast.error(errorMessage(err, 'Could not open the file'))
      }
    },
    [toast],
  )

  const download = useCallback(
    async (targets: DriveItem[]) => {
      const files = targets.filter((t) => t.kind === 'file')
      if (files.length === 0) {
        toast.show('Folders can’t be downloaded; select files instead')
        return
      }
      try {
        for (const file of files) {
          const signed = await presignDownload(file.key, true)
          // The signed URL sets Content-Disposition: attachment, so the page stays put
          const link = document.createElement('a')
          link.href = signed.url
          link.rel = 'noopener'
          document.body.appendChild(link)
          link.click()
          link.remove()
          if (files.length > 1) await new Promise((r) => setTimeout(r, 400))
        }
        if (files.length > 1) toast.show(`Downloading ${files.length} files`)
      } catch (err) {
        toast.error(errorMessage(err, 'Download failed'))
      }
    },
    [toast],
  )

  const open = useCallback(
    (item: DriveItem) => {
      if (item.kind === 'folder') goTo(item.key)
      else void preview(item)
    },
    [goTo, preview],
  )

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteObjects(pendingDelete.map((i) => i.key))
      const n = pendingDelete.length
      toast.show(n === 1 ? `“${pendingDelete[0].name}” deleted` : `${n} items deleted`)
      setSelected(new Set())
      if (searching) setSearch((s) => ({ ...s, items: s.items.filter((i) => !pendingDelete.some((d) => d.key === i.key)) }))
      reload()
    } catch (err) {
      toast.error(errorMessage(err, 'Delete failed'))
      throw err
    }
  }

  async function handleCreateFolder(name: string) {
    try {
      await createFolder(prefix, name)
    } catch (err) {
      throw new Error(errorMessage(err, 'Could not create the folder'))
    }
    reload()
    toast.show(`Folder “${name}” created`)
  }

  function addFiles(files: File[]) {
    if (!perms.canWrite || files.length === 0) return
    uploads.add(files, prefix)
  }

  const selectedItems = items.filter((i) => selected.has(i.key))

  // Drag & drop upload (files only: folders dropped from the OS need the folder picker)
  const dropEnabled = perms.canWrite && !searching
  const dragHandlers = dropEnabled
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return
          dragDepth.current++
          setDragging(true)
        },
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault()
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          addFiles(Array.from(e.dataTransfer.files).filter((f) => f.size > 0 || f.type !== ''))
        },
      }
    : {}

  const folderName = pathSegments(prefix).at(-1) ?? 'My Drive'
  const loading = searching ? search.status === 'loading' && search.items.length === 0 : listing.status === 'loading'

  let content
  if (!perms.canRead) {
    content = (
      <EmptyState icon="lock" title="No access to files">
        Your account can’t view files. Ask the owner for read access.
      </EmptyState>
    )
  } else if (activeConnection === null) {
    content = (
      <EmptyState
        icon="add_link"
        title="No storage connected"
        action={perms.canManageConnections ? <Button icon="add" onClick={() => navigate('/connections')}>Connect storage</Button> : undefined}
      >
        {perms.canManageConnections ? 'Connect an S3-compatible bucket to start using your drive.' : 'Ask the owner to connect a storage bucket.'}
      </EmptyState>
    )
  } else if (loading) {
    content = <ListSkeleton />
  } else if (!searching && listing.status === 'notFound') {
    content = (
      <EmptyState icon="folder_off" title="Folder not found" action={<Button onClick={() => goTo('')}>Go to My Drive</Button>}>
        This folder doesn’t exist or was deleted.
      </EmptyState>
    )
  } else if ((searching && search.status === 'error') || (!searching && listing.status === 'error')) {
    content = (
      <EmptyState icon="cloud_off" title="Couldn’t load files" action={<Button icon="refresh" onClick={reload}>Try again</Button>}>
        {searching ? search.error : listing.error}
      </EmptyState>
    )
  } else if (items.length === 0) {
    content = searching ? (
      <EmptyState icon="search_off" title="No results">
        Nothing in this storage matches “{debouncedQuery}”.
      </EmptyState>
    ) : (
      <EmptyState
        icon={prefix ? 'folder_open' : 'cloud_upload'}
        title={prefix ? 'This folder is empty' : 'Welcome to your Drive'}
        action={perms.canWrite ? <Button icon="upload" onClick={() => setNewOpen(true)}>Upload or create</Button> : undefined}
      >
        {perms.canWrite ? 'Drop files here, or use the New button.' : 'There’s nothing here yet.'}
      </EmptyState>
    )
  } else {
    content = (
      <>
        <FileList
          items={items}
          view={view}
          sortField={sortField}
          sortDir={sortDir}
          onSortChange={(field, dir) => {
            setSortField(field)
            setSortDir(dir)
            writePref('ps_sort', field)
            writePref('ps_sort_dir', dir)
          }}
          selected={selected}
          onSelectionChange={setSelected}
          canSelect
          showLocation={searching}
          onOpen={open}
          onDownload={(item) => void download([item])}
          onDelete={perms.canWrite ? (item) => setPendingDelete([item]) : undefined}
          onOpenLocation={(item) => goTo(item.location ?? '')}
        />
        <StatusBar
          items={items}
          hasMore={!searching && !!listing.nextToken}
          loadingMore={listing.loadingMore}
          onLoadMore={listing.loadMore}
          note={searching && search.truncated ? 'Showing the first 300 matches. Refine your search to narrow it down.' : undefined}
        />
      </>
    )
  }

  return (
    <AppShell
      search={perms.canRead ? { value: query, onChange: setQuery, busy: search.status === 'loading' } : undefined}
      onNew={perms.canWrite ? () => setNewOpen(true) : undefined}
    >
      <div className="flex-1 min-h-0 flex flex-col relative" {...dragHandlers}>
        <Toolbar
          segments={pathSegments(prefix)}
          onNavigate={goTo}
          searchQuery={searching ? debouncedQuery : undefined}
          view={view}
          onViewChange={(v) => {
            setView(v)
            writePref('ps_view', v)
          }}
          selectedCount={selected.size}
          onClearSelection={() => setSelected(new Set())}
          onDownloadSelected={selectedItems.some((i) => i.kind === 'file') ? () => void download(selectedItems) : undefined}
          onDeleteSelected={perms.canWrite ? () => setPendingDelete(selectedItems) : undefined}
        />
        {!searching && listing.status === 'ready' && listing.error && (
          <div className="mx-6 mb-2 text-sm text-danger">{listing.error}</div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">{content}</div>

        {dragging && (
          <div className="absolute inset-2 rounded-2xl border-2 border-primary bg-primary/5 flex items-end justify-center pb-10 pointer-events-none anim-fade z-20">
            <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-primary text-white shadow-raised">
              <span className="icon">upload</span>
              Drop files to upload them to <strong className="font-medium">{folderName}</strong>
            </div>
          </div>
        )}
      </div>

      <NewMenu open={newOpen} onClose={() => setNewOpen(false)} onCreateFolder={handleCreateFolder} onFiles={addFiles} />
      <UploadTray items={uploads.items} onCancel={uploads.cancel} onCancelAll={uploads.cancelAll} onClose={uploads.clear} />
      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.length === 1 ? `Delete “${pendingDelete[0].name}”?` : `Delete ${pendingDelete?.length ?? 0} items?`}
        message={
          pendingDelete?.some((i) => i.kind === 'folder')
            ? 'Folders are deleted with everything inside them. This can’t be undone.'
            : 'This permanently deletes the selected items. This can’t be undone.'
        }
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </AppShell>
  )
}

function ListSkeleton() {
  return (
    <div className="px-6 pt-2 space-y-3" aria-busy="true" aria-label="Loading files">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 h-9">
          <div className="skeleton w-6 h-6 rounded" />
          <div className="skeleton h-4 rounded-full" style={{ width: `${30 + ((i * 37) % 40)}%` }} />
        </div>
      ))}
    </div>
  )
}
