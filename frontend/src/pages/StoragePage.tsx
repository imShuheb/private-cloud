import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteObjects, errorMessage, presignDownload } from '../api'
import BarList, { type BarRow } from '../components/analytics/BarList'
import Card from '../components/analytics/Card'
import Duplicates from '../components/analytics/Duplicates'
import KpiTiles from '../components/analytics/KpiTiles'
import LargestFiles from '../components/analytics/LargestFiles'
import TypeBreakdown from '../components/analytics/TypeBreakdown'
import AppShell from '../components/layout/AppShell'
import Button, { Spinner } from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { permissionsOf, useUser } from '../context/auth'
import { useToast } from '../context/toast'
import { useAnalytics } from '../hooks/useAnalytics'
import { cx, folderLabel, formatBytes, formatCount, formatDateTime, relativeTime } from '../lib'
import type { AnalyticsFile, Category } from '../types'

export default function StoragePage() {
  const user = useUser()
  const perms = permissionsOf(user)
  const navigate = useNavigate()
  const toast = useToast()
  const { data, error, busy, scan, cancel, reload } = useAnalytics()

  const [category, setCategory] = useState<Category | ''>('')
  const [folder, setFolder] = useState('')
  const [folderScope, setFolderScope] = useState<'root' | 'all'>('root')
  const [filesVersion, setFilesVersion] = useState(0)
  const [changedSinceScan, setChangedSinceScan] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AnalyticsFile | null>(null)
  const filesRef = useRef<HTMLDivElement>(null)

  const report = data?.report ?? null
  const status = data?.status
  const running = status?.state === 'running'

  const folderRows: BarRow[] = useMemo(() => {
    const list = (folderScope === 'root' ? report?.rootFolders : report?.topFolders) ?? []
    return list.slice(0, 12).map((f) => ({ key: f.prefix, label: folderLabel(f.prefix), title: f.prefix, bytes: f.bytes, count: f.files }))
  }, [report, folderScope])

  const sizeRows: BarRow[] = useMemo(
    () => (report?.sizeDistribution ?? []).map((b) => ({ key: b.key, label: b.label, title: b.label, bytes: b.bytes, count: b.count })),
    [report],
  )
  const ageRows: BarRow[] = useMemo(
    () => (report?.ageDistribution ?? []).map((b) => ({ key: b.key, label: b.label, title: `Modified ${b.label.toLowerCase()}`, bytes: b.bytes, count: b.count })),
    [report],
  )

  function showFiles() {
    filesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function openFolder(prefix: string) {
    navigate(`/drive/${prefix.split('/').map(encodeURIComponent).join('/')}`)
  }

  async function preview(file: AnalyticsFile) {
    const tab = window.open('', '_blank')
    try {
      const signed = await presignDownload(file.key, false)
      if (tab) {
        tab.opener = null
        tab.location.href = signed.url
      }
    } catch (err) {
      tab?.close()
      toast.error(errorMessage(err, 'Could not open the file'))
    }
  }

  async function download(file: AnalyticsFile) {
    try {
      const signed = await presignDownload(file.key, true)
      const link = document.createElement('a')
      link.href = signed.url
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      toast.error(errorMessage(err, 'Download failed'))
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    try {
      await deleteObjects([pendingDelete.key])
      toast.show(`“${pendingDelete.name}” deleted · rescan to update the totals`)
      setChangedSinceScan(true)
      setFilesVersion((v) => v + 1)
    } catch (err) {
      toast.error(errorMessage(err, 'Delete failed'))
      throw err
    }
  }

  async function startScan() {
    setChangedSinceScan(false)
    await scan()
  }

  let body
  if (!perms.canRead) {
    body = <EmptyState icon="lock" title="No access to files">Storage insights need read access to files.</EmptyState>
  } else if (!data && !error) {
    body = (
      <div className="flex justify-center py-24 text-primary">
        <Spinner />
      </div>
    )
  } else if (!data) {
    body = (
      <EmptyState icon="cloud_off" title="Couldn’t load storage insights" action={<Button icon="refresh" onClick={reload}>Try again</Button>}>
        {error}
      </EmptyState>
    )
  } else if (!report && running) {
    body = (
      <div className="flex flex-col items-center text-center py-20 px-6 anim-fade">
        <div className="w-[120px] h-[120px] rounded-full bg-raised flex items-center justify-center mb-6">
          <span className="icon text-[56px] text-primary">data_usage</span>
        </div>
        <h2 className="text-[22px] text-ink mb-2">Scanning your storage…</h2>
        <p className="text-sm text-ink-2 mb-6 tabular-nums">
          {formatCount(status?.scannedObjects)} objects · {formatBytes(status?.scannedBytes)} so far
        </p>
        <div className="w-64 h-1 rounded-full bg-line-soft overflow-hidden mb-6">
          <div className="h-full rounded-full progress-indeterminate" />
        </div>
        <Button variant="outlined" onClick={cancel} loading={busy}>
          Stop scan
        </Button>
      </div>
    )
  } else if (!report) {
    body = (
      <EmptyState
        icon="data_usage"
        title="See where your storage goes"
        action={<Button icon="radar" onClick={startScan} loading={busy}>Scan storage</Button>}
      >
        A scan reads the list of every file in {data.bucket || 'this bucket'} (not the files themselves) to find the biggest files and folders.
        {status?.state === 'failed' && <span className="block mt-3 text-danger">Last scan failed: {status.error}</span>}
      </EmptyState>
    )
  } else {
    const typeBuckets = report.byCategory ?? []
    body = (
      <div className="px-4 sm:px-6 pb-10 space-y-4">
        <KpiTiles report={report} onLargestClick={showFiles} />

        <Card title="Storage by type" subtitle={`${formatBytes(report.totalBytes)} across ${formatCount(report.totalFiles)} files`}>
          {typeBuckets.length > 0 ? (
            <TypeBreakdown
              buckets={typeBuckets}
              totalBytes={report.totalBytes}
              selected={category}
              onSelect={(c) => {
                setCategory(c)
                if (c) showFiles()
              }}
            />
          ) : (
            <p className="text-sm text-ink-3">No files yet.</p>
          )}
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title="Largest folders"
            subtitle="Includes everything inside each folder · select one to list its files"
            actions={
              <div className="flex rounded-full border border-[#747775] overflow-hidden text-xs">
                {(['root', 'all'] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setFolderScope(scope)}
                    aria-pressed={folderScope === scope}
                    className={cx('h-8 px-3', folderScope === scope ? 'bg-primary-soft text-on-primary-soft font-medium' : 'text-ink-2 hover:bg-hover')}
                  >
                    {scope === 'root' ? 'Top level' : 'All levels'}
                  </button>
                ))}
              </div>
            }
          >
            <BarList
              rows={folderRows}
              total={report.totalBytes}
              activeKey={folder}
              emptyText="All files are at the top level."
              onRowClick={(key) => {
                setFolder(folder === key ? '' : key)
                if (folder !== key) showFiles()
              }}
            />
          </Card>

          <div className="grid gap-4">
            <Card title="File sizes" subtitle="Storage used by files in each size range">
              <BarList rows={sizeRows} total={report.totalBytes} />
            </Card>
            <Card title="Last modified" subtitle="Storage used by how recently files changed">
              <BarList rows={ageRows} total={report.totalBytes} />
            </Card>
          </div>
        </div>

        <div ref={filesRef} className="scroll-mt-4">
          <Card title="Largest files" subtitle="Sort and filter to find what takes up the most space">
            <LargestFiles
              reportAt={report.generatedAt}
              maxFiles={data.maxLargestFiles}
              category={category}
              onCategoryChange={setCategory}
              folder={folder}
              onFolderChange={setFolder}
              version={filesVersion}
              canWrite={perms.canWrite}
              onPreview={preview}
              onDownload={download}
              onOpenFolder={openFolder}
              onDelete={setPendingDelete}
            />
          </Card>
        </div>

        <Card
          title="Possible duplicates"
          subtitle={
            report.duplicateWastedBytes > 0
              ? `${formatBytes(report.duplicateWastedBytes)} could be freed by keeping one copy of each`
              : 'Files with the same size and checksum'
          }
        >
          <Duplicates groups={report.duplicates ?? []} onOpenFolder={openFolder} />
        </Card>
      </div>
    )
  }

  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        <div className="px-4 sm:px-6 pt-5 pb-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl text-ink">Storage insights</h1>
            {report && (
              <p className="text-sm text-ink-2 mt-0.5" title={formatDateTime(report.generatedAt)}>
                {data?.bucket} · scanned {relativeTime(report.generatedAt)}
                {changedSinceScan && <span className="text-ink-3"> · files changed since</span>}
              </p>
            )}
          </div>
          {report && perms.canRead && (
            <div className="flex items-center gap-2">
              {running ? (
                <>
                  <span className="text-sm text-ink-2 tabular-nums flex items-center gap-2">
                    <Spinner small className="text-primary" />
                    {formatCount(status?.scannedObjects)} objects scanned
                  </span>
                  <Button variant="outlined" onClick={cancel} loading={busy}>
                    Stop
                  </Button>
                </>
              ) : (
                <Button variant="tonal" icon="refresh" onClick={startScan} loading={busy}>
                  Rescan
                </Button>
              )}
            </div>
          )}
        </div>
        {status?.state === 'failed' && report && (
          <div className="mx-4 sm:mx-6 mb-4 px-4 py-3 rounded-xl bg-danger-soft text-sm text-danger flex items-center gap-2">
            <span className="icon">error</span>
            The last scan failed ({status.error}). Showing results from {relativeTime(report.generatedAt)}.
          </div>
        )}
        {body}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title={`Delete “${pendingDelete?.name ?? ''}”?`}
        message={`This permanently deletes ${pendingDelete ? formatBytes(pendingDelete.size) : ''} from ${folderLabel(pendingDelete?.folder ?? '')}. This can’t be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </AppShell>
  )
}
