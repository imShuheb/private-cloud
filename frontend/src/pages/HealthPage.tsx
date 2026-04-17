import { useEffect, useState } from 'react'
import { getAnalyticsSnapshot, getDriveStats, triggerInventoryScan } from '../api'
import { formatBytes } from '../lib'
import type { User } from '../types'
import Header from '../components/layout/Header'
import Sidebar from '../components/layout/Sidebar'
import StatusBar from '../components/drive/StatusBar'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { AlertCircle, Zap, ShieldCheck, Database, LayoutGrid } from 'lucide-react'

type Props = {
  user: User
  onLogout: () => void
}

const COLORS = ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#a142f4', '#24c1e0']

export default function HealthPage({ user, onLogout }: Props) {
  const [data, setData] = useState<any>(null)
  const [stats, setStats] = useState({ totalSize: 0, totalFiles: 0, totalFolders: 0, isConfigured: false })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [snapshot, s] = await Promise.all([getAnalyticsSnapshot(), getDriveStats()])
      setData(snapshot)
      setStats(s)
    } catch (err: any) {
      setStatus('Failed to load health data')
    } finally {
      setLoading(false)
    }
  }

  async function handleTriggerScan() {
    const key = prompt('Please enter the S3 key of your Inventory CSV (gzipped):', 'inventory/reports/manifest.csv.gz')
    if (!key) return

    setScanning(true)
    setStatus('Triggering inventory scan...')
    try {
      await triggerInventoryScan(key)
      setStatus('Scan triggered successfully. Check Background Jobs for progress.')
    } catch (err) {
      setStatus('Failed to trigger scan')
    } finally {
      setScanning(false)
    }
  }

  const chartData = data?.stats?.map((s: any) => ({
    name: s.storageClass,
    value: s.totalSize
  })) || []

  const totalCost = data?.totalCost || 0

  return (
    <div className="h-screen flex flex-col bg-[#f8f9fa] overflow-hidden">
      <Header
        user={user}
        loading={loading}
        query=""
        onQueryChange={() => { }}
        onRefresh={load}
        onLogout={onLogout}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          onNewClick={() => { }}
          filesCount={stats.totalFiles}
          foldersCount={stats.totalFolders}
          totalSize={stats.totalSize}
          isConfigured={stats.isConfigured}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-white mt-1.5 ml-1.5 rounded-tl-xl border-t border-l border-gray-100 shadow-sm p-8">
          <div className="max-w-6xl mx-auto w-full overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Storage Health & Insights</h1>
                <p className="text-gray-500 text-sm mt-1">Identify waste and optimize your cloud storage costs.</p>
              </div>
              <button
                onClick={handleTriggerScan}
                disabled={scanning}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                <Zap className={`w-4 h-4 ${scanning ? 'animate-pulse' : ''}`} />
                {scanning ? 'Triggering...' : 'Scan Inventory'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="p-6 bg-blue-600 rounded-3xl text-white shadow-xl shadow-blue-500/10 relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4 opacity-80 uppercase tracking-widest text-[10px] font-bold">
                    <ShieldCheck className="w-4 h-4" />
                    Est. Monthly Cost
                  </div>
                  <div className="text-4xl font-bold mb-1">${totalCost.toFixed(2)}</div>
                  <div className="text-sm opacity-70">Based on your custom pricing tiers</div>
                </div>
              </div>

              <div className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-gray-400 uppercase tracking-widest text-[10px] font-bold">
                  <Database className="w-4 h-4 text-green-500" />
                  Total Managed Data
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">{formatBytes(stats.totalSize)}</div>
                <div className="text-sm text-gray-500">Across {stats.totalFiles} objects</div>
              </div>

              <div className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-gray-400 uppercase tracking-widest text-[10px] font-bold">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  Ghost Data (Waste)
                </div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                    {data?.stats?.find((s:any) => s.storageClass === 'GLACIER_IR') ? 'Calculated' : '--'}
                </div>
                <div className="text-sm text-gray-500">Objects unmodified {'>'} 365 days</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="p-8 bg-white rounded-3xl border border-gray-100 shadow-sm min-h-[400px]">
                <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-blue-500" />
                  Storage Class Distribution
                </h3>
                {chartData.length > 0 ? (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {chartData.map((_:any, index:number) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip 
                            formatter={(value: number) => formatBytes(value)}
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[250px] text-gray-400">
                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                      <LayoutGrid className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium">No storage class data available.</p>
                    <p className="text-xs">Run an inventory scan to generate insights.</p>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-900 mb-4">Pricing Breakdown</h3>
                    <div className="space-y-3">
                        {data?.pricing?.map((p: any) => (
                            <div key={p.storageClass} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                <span className="text-sm font-bold text-gray-600 font-mono">{p.storageClass}</span>
                                <span className="text-sm font-bold text-blue-600">${p.pricePerGb.toFixed(4)} / GB</span>
                            </div>
                        ))}
                        {(!data?.pricing || data.pricing.length === 0) && (
                            <div className="text-center py-4 text-xs text-gray-400 italic">
                                No custom pricing configured. Using defaults.
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100">
                    <div className="flex items-start gap-4">
                        <div className="p-2 bg-amber-100 rounded-xl">
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <h4 className="font-bold text-amber-900 text-sm">Optimization Tip</h4>
                            <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                                You have significant data in <b>STANDARD</b> storage. Moving objects unmodified for 90 days to <b>INTELLIGENT_TIERING</b> could save you up to 30% monthly.
                            </p>
                        </div>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <StatusBar
        loading={loading}
        status={status}
      />
    </div>
  )
}
