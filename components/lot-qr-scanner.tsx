'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Factory,
  FlaskConical,
  MapPin,
  PackageCheck,
  QrCode,
  ScanLine,
  Sparkles,
  Truck,
  Warehouse,
  X,
  XCircle,
} from 'lucide-react'
import { SLOTTING_CRITERION, SLOTTING_ZONE } from '@/lib/slotting'
import SlottingGrid from '@/components/slotting-grid'

type Lot = {
  batchId: string
  product: string
  ph: string
  density: string
  notes: string | null
  units: number
  weightKg: number
  status: 'approved' | 'pnc'
  placementStatus: 'pendiente_ubicar' | 'ubicado' | 'no_aplica'
  manufacturedAt: string | null
  expiresAt: string | null
  placedAt: string | null
  createdAt: string
}

type Slotting = {
  aisle: string
  rack: string
  level: number
  cell: string
  zone: string
  criterion: string
  distanceToDispatch: number
}

type ScanResponse = {
  lot: Lot
  slotting: Slotting
  placeable: boolean
}

const DEMO_LOTS = ['LOTE-GLISS-2026-01', 'LOTE-LITO-2026-02']

function fmtDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'
}

function fmtDateTime(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'
}

function QualityBadge({ status }: { status: Lot['status'] }) {
  return status === 'approved' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
      <CheckCircle2 className="size-3.5" />
      Aprobado · Listo para CEDI
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
      <XCircle className="size-3.5" />
      Bloqueado · PNC
    </span>
  )
}

function PlacementBadge({ lot }: { lot: Lot }) {
  if (lot.status !== 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
        <XCircle className="size-3.5" />
        No apto para CEDI
      </span>
    )
  }
  if (lot.placementStatus === 'ubicado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <PackageCheck className="size-3.5" />
        Ubicado en CEDI
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
      <MapPin className="size-3.5" />
      Pendiente de ubicar
    </span>
  )
}

/** Mini retícula 2D del pasillo: niveles en el eje Y, estantes en el eje X. */

export default function LotQrScanner() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ScanResponse | null>(null)
  const [toast, setToast] = useState<ScanResponse | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const demoIndex = useRef(0)

  async function performScan(rawId?: string) {
    const id = (rawId ?? query).trim().toUpperCase()
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/cedi?q=${encodeURIComponent(id)}`)
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'No fue posible consultar el lote.')
        setToast(null)
        setDetail(null)
        return
      }
      setQuery(id)
      setConfirmError(null)
      setDetail(data)
      setToast(data)
    } catch {
      setError('Sin conexión con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  function simulateScan() {
    const id = DEMO_LOTS[demoIndex.current % DEMO_LOTS.length]
    demoIndex.current += 1
    setQuery(id)
    performScan(id)
  }

  async function confirmPlacement() {
    if (!detail || !detail.placeable) return
    setConfirming(true)
    setConfirmError(null)
    try {
      const response = await fetch('/api/cedi', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: detail.lot.batchId }),
      })
      const data = await response.json()
      if (!response.ok) {
        setConfirmError(data.error ?? 'No fue posible confirmar la colocación.')
        return
      }
      setDetail(data)
    } catch {
      setConfirmError('Sin conexión con el servidor.')
    } finally {
      setConfirming(false)
    }
  }

  const slot: Slotting = detail?.slotting ?? (toast?.slotting as Slotting | undefined) ?? {
    aisle: 'A',
    rack: '02',
    level: 1,
    cell: 'A-02 / Nivel 1',
    zone: 'Zona de Alta Rotación',
    criterion: 'Política FIFO · Cercano a salida de despachos',
    distanceToDispatch: 18,
  }

  return (
    <div className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-3 transition hover:opacity-80"
            title="Volver al inicio"
          >
            <div className="flex size-9 items-center justify-center rounded-xl bg-teal-700 text-white">
              <Warehouse className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold tracking-tight text-slate-950">
                  AQUA<span className="text-teal-700">LAB</span>
                </p>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-700 ring-1 ring-teal-100">
                  CEDI
                </span>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Recepción y slotting
              </p>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          CEDI Central · Operativo
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-5 sm:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                Escáner de lotes
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                Ubica la mercancía en el CEDI
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Escanea el QR de un lote aprobado por calidad y el sistema te indicará la posición
                sugerida en bodega al instante.
              </p>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <ScanLine className="size-6" />
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <div className="relative flex-1">
              <QrCode className="absolute left-3 top-3 size-5 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && performScan()}
                placeholder="LOTE-GLISS-2026-01"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 font-mono text-sm font-semibold uppercase outline-none transition focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <button
              onClick={() => performScan()}
              disabled={loading}
              className="h-11 shrink-0 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? 'Consultando…' : 'Escanear'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Simulación demo:</span>
            {DEMO_LOTS.map((id) => (
              <button
                key={id}
                onClick={() => {
                  setQuery(id)
                  performScan(id)
                }}
                className={`rounded-full border px-3 py-1 font-mono text-[11px] font-bold transition ${
                  query === id
                    ? 'border-teal-300 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-700'
                }`}
              >
                {id}
              </button>
            ))}
            <button
              onClick={simulateScan}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-teal-300 bg-teal-50/60 px-3 py-1 text-[11px] font-bold text-teal-700 transition hover:bg-teal-100"
            >
              <Sparkles className="size-3.5" />
              Simular escaneo
            </button>
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
            <ScanLine className="size-3.5" />
            Los lectores de QR por USB escriben el ID y pulsan Enter automáticamente.
          </p>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-500" />
            <p className="font-semibold">{error}</p>
          </div>
        )}

        {!detail && !error && (
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: CalendarDays,
                title: 'Trazabilidad', 
                text: 'Cada lote conserva su historial de calidad y fechas para el CEDI.',
              },
              {
                icon: MapPin,
                title: 'Slotting FIFO',
                text: 'Posición sugerida cerca de la salida de despachos, según política FIFO.',
              },
              {
                icon: Boxes,
                title: 'Confirmación',
                text: 'Un toque marca el lote como Ubicado en la base de datos.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon className="size-5 text-teal-600" />
                <p className="mt-3 text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Toast inferior */}
      {toast && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl ring-1 ring-emerald-100 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-start gap-3">
              <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
                <QrCode className="size-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  QR detectado: <span className="font-mono">{toast.lot.batchId}</span>
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Posición sugerida:{' '}
                  <span className="font-bold text-emerald-700">
                    {toast.slotting.aisle}-{toast.slotting.rack} / Nivel {toast.slotting.level}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">{toast.slotting.zone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setModalOpen(true)
                  setToast(null)
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                Ver Detalle y Ubicar <ArrowRight className="size-4" />
              </button>
              <button
                onClick={() => setToast(null)}
                aria-label="Cerrar notificación"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {modalOpen && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <button
            aria-label="Cerrar detalle"
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-950 p-2 text-white">
                  <Warehouse className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Ficha del lote
                  </p>
                  <h2 className="font-mono text-lg font-bold text-slate-950">{detail.lot.batchId}</h2>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              {/* Bloque destacado de slotting */}
              <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-100">
                      Posición sugerida (Slotting)
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      Pasillo {detail.slotting.aisle} <span className="text-emerald-200">|</span>{' '}
                      Estante {detail.slotting.rack} <span className="text-emerald-200">|</span>{' '}
                      Nivel {detail.slotting.level}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/25">
                        <MapPin className="size-3.5" />
                        {detail.slotting.zone}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/25">
                        <Truck className="size-3.5" />
                        a {detail.slotting.distanceToDispatch} m de la salida de despachos
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/20">
                    <Factory className="size-6" />
                  </div>
                </div>
                <div className="border-t border-white/15 bg-black/10 px-5 py-3">
                  <p className="text-xs font-semibold text-emerald-50">
                    Criterio de slotting: <span className="font-bold">{detail.slotting.criterion}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-2">
                <SlottingGrid slot={detail.slotting} />
              </div>

              {/* Información complementaria */}
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    Información del lote
                  </h3>
                  <PlacementBadge lot={detail.lot} />
                </div>
                <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Producto
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{detail.lot.product}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Estado de calidad
                    </p>
                    <div className="mt-1">
                      <QualityBadge status={detail.lot.status} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Cantidad
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {new Intl.NumberFormat('es-MX').format(detail.lot.units)} cajas
                      <span className="ml-2 font-semibold text-slate-500">
                        {detail.lot.weightKg > 0
                          ? `${new Intl.NumberFormat('es-MX').format(detail.lot.weightKg)} kg`
                          : ''}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Parámetros de calidad
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold text-slate-900">
                      pH {detail.lot.ph}
                      <span className="mx-1 text-slate-300">·</span>
                      {detail.lot.density} g/mL
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Fecha de fabricación
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
                      <CalendarDays className="size-4 text-slate-400" />
                      {fmtDate(detail.lot.manufacturedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Vencimiento
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-900">
                      <CalendarDays className="size-4 text-slate-400" />
                      {fmtDate(detail.lot.expiresAt)}
                    </p>
                  </div>
                </div>
                {detail.lot.notes && (
                  <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    {detail.lot.notes}
                  </p>
                )}
              </section>

              {/* Confirmación */}
              {detail.lot.status !== 'approved' && (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-800">
                  <XCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
                  <div>
                    <p className="font-bold">Lote bloqueado por calidad (PNC)</p>
                    <p className="mt-0.5 text-xs">No se puede ubicar mercancía no conforme en el CEDI.</p>
                  </div>
                </div>
              )}
              {detail.lot.status === 'approved' && detail.lot.placementStatus === 'ubicado' && (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
                  <PackageCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-bold">Lote ubicado en el CEDI</p>
                    <p className="mt-0.5 text-xs">
                      Colocado en {detail.slotting.cell} · {fmtDateTime(detail.lot.placedAt)}
                    </p>
                  </div>
                </div>
              )}
              {detail.lot.status === 'approved' && detail.lot.placementStatus !== 'ubicado' && (
                <>
                  {confirmError && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                      <AlertTriangle className="size-4" />
                      {confirmError}
                    </div>
                  )}
                  <button
                    onClick={confirmPlacement}
                    disabled={confirming}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <PackageCheck className="size-5" />
                    {confirming ? 'Confirmando…' : 'Confirmar Colocación en Ubicación Sugerida'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}