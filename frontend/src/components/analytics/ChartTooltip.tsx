import type { TipState } from './useChartTooltip'

export function ChartTooltip({ tip }: { tip: TipState }) {
  if (!tip) return null
  return (
    <div
      role="tooltip"
      className="absolute z-30 pointer-events-none -translate-x-1/2 -translate-y-full px-3 py-2 rounded-lg bg-[#303030] text-[#f2f2f2] text-xs shadow-raised whitespace-nowrap"
      style={{ left: tip.x, top: tip.y - 12 }}
    >
      {tip.content}
    </div>
  )
}
