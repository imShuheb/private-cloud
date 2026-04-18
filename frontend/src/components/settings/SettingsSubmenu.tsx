import React from 'react'

type Item = {
  key: string
  label: string
  icon: string
}

type SettingsSubmenuProps = {
  items: Item[]
  activeKey: string
  onChange: (key: string) => void
}

const SettingsSubmenu: React.FC<SettingsSubmenuProps> = ({ items, activeKey, onChange }) => {
  return (
    <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-2 border-b border-gray-200 pb-3">
      {items.map((item) => {
        const active = activeKey === item.key
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`flex items-center justify-center md:justify-start gap-2 px-3 py-2 text-xs font-bold border ${active ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-300 hover:border-black'}`}
          >
            <span className="material-symbols-outlined text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default SettingsSubmenu
