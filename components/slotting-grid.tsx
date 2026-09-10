'use client'

import { CheckCircle2, MapPin, Truck } from 'lucide-react'
import { SLOTTING_LEVELS, SLOTTING_RACKS, rackCode, type SlottingSuggestion } from '@/lib/slotting'

/** Mini retícula 2D del pasillo del CEDI: niveles en Y, estantes en X. */
export default function SlottingGrid({
  slot,
  title,
  exitLabel,
}: {
  slot: SlottingSuggestion
  title?: string
  exitLabel?: string
}) {
  const rackIdx = Number(slot.rack)
  const heading = title ?? `Pasillo ${slot.aisle} · vista frontal del rack`
  const exit = exitLabel ?? 'Salida\ndespachos'

  return (
    <div className="flex items-stretch gap-3">
      <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{heading}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            <MapPin className="size-3" />
            Posición sugerida
          </span>
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: SLOTTING_LEVELS }, (_, rowIndex) => {
            const lvl = SLOTTING_LEVELS - rowIndex
            const active = lvl === slot.level
            return (
              <div key={lvl} className="flex items-center gap-1.5">
                <span
                  className={`w-6 text-right text-[10px] font-bold ${
                    active ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  N{lvl}
                </span>
                <div
                  className="grid flex-1 gap-1"
                  style={{ gridTemplateColumns: `repeat(${SLOTTING_RACKS}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: SLOTTING_RACKS }, (_, colIndex) => {
                    const rk = colIndex + 1
                    const isTarget = active && rk === rackIdx
                    return (
                      <div
                        key={rk}
                        className={`flex h-7 items-center justify-center rounded-md border text-[10px] font-bold transition ${
                          isTarget
                            ? 'border-emerald-600 bg-emerald-500 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-300'
                        }`}
                      >
                        {isTarget ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="size-3.5" />
                            {slot.aisle}-{rackCode(rk)}
                          </span>
                        ) : (
                          `${slot.aisle}-${rackCode(rk)}`
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5">
            <span className="w-6" />
            <div
              className="grid flex-1 gap-1"
              style={{ gridTemplateColumns: `repeat(${SLOTTING_RACKS}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: SLOTTING_RACKS }, (_, i) => (
                <span key={i} className="text-center text-[9px] font-semibold text-slate-400">
                  E{i + 1}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-11 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-400">
        <Truck className="size-4 rotate-90 text-slate-300" />
        {exit.split('\n').map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </div>
    </div>
  )
}