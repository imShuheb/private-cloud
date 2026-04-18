import React from 'react'
import type { ConnectionsList } from '../../types'

type SettingsConnectionsSectionProps = {
  data: ConnectionsList | null
  loading: boolean
  onOpenConnections: () => void
}

const SettingsConnectionsSection: React.FC<SettingsConnectionsSectionProps> = ({ data, loading, onOpenConnections }) => {
  return (
    <section className="p-3 sm:p-4 md:p-5 border border-gray-300 bg-white">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-black uppercase tracking-wide">Connections</h2>
          <p className="text-xs text-gray-700 mt-1">Connection profiles are managed in a separate page.</p>
        </div>
        <button
          onClick={onOpenConnections}
          className="px-4 py-2 text-sm font-bold text-white bg-black border border-black"
        >
          Open Connections
        </button>
      </div>

      {loading ? (
        <div className="h-16 border border-gray-200 bg-gray-50 animate-pulse" />
      ) : (
        <div className="border border-gray-300 overflow-x-auto">
          <table className="w-full min-w-190 text-sm">
            <thead className="bg-gray-50 border-b border-gray-300">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Name</th>
                <th className="text-left px-3 py-2 font-bold">Bucket</th>
                <th className="text-left px-3 py-2 font-bold">Region</th>
                <th className="text-left px-3 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.connections?.map((c) => (
                <tr key={c.id} className="border-b border-gray-200">
                  <td className="px-3 py-2 font-semibold">{c.name}</td>
                  <td className="px-3 py-2">{c.bucket}</td>
                  <td className="px-3 py-2">{c.region}</td>
                  <td className="px-3 py-2">
                    {c.id === data.activeId ? (
                      <span className="px-2 py-1 text-[11px] font-bold border border-black">Active</span>
                    ) : (
                      <span className="px-2 py-1 text-[11px] font-bold border border-gray-300 text-gray-600">Saved</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!data || data.connections.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-sm text-gray-600">No connections configured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default SettingsConnectionsSection
