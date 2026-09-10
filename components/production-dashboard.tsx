'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Boxes,
  Factory,
  Menu,
  PackageOpen,
  Play,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'

type OrderStatus = 'programado' | 'en_proceso' | 'completado' | 'retrasado_insumos' | 'cancelado'

type ApiOrder = {
  id: number
  code: string
  product: string
  units: number
  line: 'A' | 'B'
  shift: string
  scheduledDate: string
  status: OrderStatus
  priority: number
  origin: 'autonomo' | 'manual'
  materialAvailable: boolean
  rationale: string | null
  completedAt: string | null
  createdAt: string
}

type Shift = { id: string; label: string; start: string; end: string }
type ProductCap = { name: string; line: 'A' | 'B'; capacityPerShift: number }
type Day = { date: string; key: string; weekday: string }
type PendingBatch = { batchId: string; product: string; units: number; createdAt: string }

type Kpis = {
  plannedToday: number
  ordersToday: number
  inProcess: number
  completed: number
  completedUnits: number
  onHold: number
}

const nf = new Intl.NumberFormat('es-MX')

const fmtNum = (n: number) => nf.format(n)
const fmtDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' })
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

const STATUS_TONE: Record<OrderStatus, string> = {
  programado: 'bg-slate-50 text-slate-700 ring-slate-200',
  en_proceso: 'bg-amber-50 text-amber-700 ring-amber-200',
  completado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  retrasado_insumos: 'bg-red-50 text-red-700 ring-red-200',
  cancelado: 'bg-slate-100 text-slate-400 ring-slate-200',
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  programado: 'Programado',
  en_proceso: 'En proceso',
  completado: 'Completado',
  retrasado_insumos: 'Pendiente de insumos',
  cancelado: 'Cancelado',
}

const STATUS_CELL: Record<OrderStatus, string> = {
  programado: 'bg-slate-50 border-slate-200 text-slate-600',
  en_proceso: 'bg-amber-50 border-amber-200 text-amber-800',
  completado: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  retrasado_insumos: 'bg-red-50 border-red-200 text-red-800',
  cancelado: 'bg-slate-100 border-slate-200 text-slate-400',
}

const LINE_LABEL: Record<string, string> = { A: 'Línea de líquidos', B: 'Línea de polvos' }

const PAGES = [
  { id: 'programa', label: 'Programa y turnos', icon: CalendarDays },
  { id: 'rendimiento', label: 'Rendimiento por turno', icon: Activity },
  { id: 'completadas', label: 'Órdenes completadas', icon: CheckCircle2 },
] as const

type PageId = (typeof PAGES)[number]['id']

function NextActions({
  status,
  onAction,
  busy,
}: {
  status: OrderStatus
  onAction: (s: OrderStatus) => void
  busy: boolean
}) {
  if (status === 'programado' || status === 'retrasado_insumos') {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={() => onAction('en_proceso')}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Play className="size-3.5" /> Iniciar
        </button>
        <button
          onClick={() => onAction('cancelado')}
          disabled={busy}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    )
  }
  if (status === 'en_proceso') {
    return (
      <button
        onClick={() => onAction('completado')}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        <CheckCircle2 className="size-3.5" /> Completar y consumir
      </button>
    )
  }
  return null
}

function Bars({ data, tone = 'bg-teal-600' }: { data: { label: string; value: number }[]; tone?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex h-40 items-end gap-2 border-b border-l border-slate-200 px-2 pb-0 pt-4">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div
            className={`w-full rounded-t ${tone} transition group-hover:opacity-80`}
            style={{ height: `${(d.value / max) * 100}%` }}
            title={`${d.label}: ${fmtNum(d.value)}`}
          />
          <span className="text-[10px] font-semibold text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function ProductionDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeNav, setActiveNav] = useState<PageId>('programa')

  const [program, setProgram] = useState<ApiOrder[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [products, setProducts] = useState<ProductCap[]>([])
  const [days, setDays] = useState<Day[]>([])
  const [pendingBatches, setPendingBatches] = useState<PendingBatch[]>([])
  const [kpis, setKpis] = useState<Kpis | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/produccion')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setProgram(Array.isArray(data.program) ? data.program : [])
      setShifts(Array.isArray(data.shifts) ? data.shifts : [])
      setProducts(Array.isArray(data.products) ? data.products : [])
      setDays(Array.isArray(data.days) ? data.days : [])
      setPendingBatches(Array.isArray(data.pendingBatches) ? data.pendingBatches : [])
      setKpis(data.kpis ?? null)
      setError(null)
    } catch {
      setError('No se pudo cargar el programa de producción.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const mutate = useCallback(
    async (body: Record<string, unknown>, key: string, silence = false) => {
      setBusy(key)
      if (!silence) setError(null)
      try {
        const res = await fetch('/api/produccion', {
          method: body.id !== undefined ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'La operación no se pudo completar.')
          return null
        }
        await load()
        return data
      } catch {
        setError('Error de red al enviar la solicitud.')
        return null
      } finally {
        setBusy(null)
      }
    },
    [load],
  )

  const completedOrders = useMemo(() => program.filter((o) => o.status === 'completado'), [program])
  const onHoldOrders = useMemo(() => program.filter((o) => o.status === 'retrasado_insumos'), [program])

  const byCell = useMemo(() => {
    const map = new Map<string, ApiOrder[]>()
    for (const o of program) {
      const cell = `${new Date(o.scheduledDate).toISOString().slice(0, 10)}|${o.shift}`
      const list = map.get(cell)
      if (list) list.push(o)
      else map.set(cell, [o])
    }
    return map
  }, [program])

  const generate = async () => {
    setBusy('generar')
    setError(null)
    setMessage(null)
    try {
      const data = await mutate({ action: 'generar' }, 'generar', true)
      if (data?.message) setMessage(data.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Link href="/" className="flex h-20 items-center gap-3 border-b border-slate-100 px-6 transition hover:bg-slate-50" title="Volver al inicio">
          <div className="flex size-9 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Boxes className="size-5" />
          </div>
          <div>
            <p className="font-bold tracking-tight text-slate-950">
              AQUA<span className="text-teal-700">LAB</span>
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Producción</p>
          </div>
        </Link>
        <nav className="space-y-1 px-3 py-6">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setActiveNav(id)
                setMenuOpen(false)
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
                activeNav === id ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="size-[18px]" />
              {label}
              {id === 'completadas' && completedOrders.length > 0 && (
                <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {completedOrders.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 w-full border-t border-slate-100 p-4">
          <button
            onClick={load}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-50 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            <RefreshCw className="size-3.5" /> Actualizar datos
          </button>
        </div>
      </aside>
      {menuOpen && <button aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-20 bg-slate-950/20 lg:hidden" />}

      <div className="lg:pl-64">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button aria-label="Abrir menú" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden">
              <Menu className="size-5" />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Planta</p>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950">
                {PAGES.find((p) => p.id === activeNav)?.label}
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">JT</div>
            <div className="text-left">
              <p className="text-xs font-bold text-slate-800">Javier Torres</p>
              <p className="text-[11px] text-slate-400">Jefe de logística</p>
            </div>
            <ChevronDown className="size-4 text-slate-400" />
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-8">
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </div>
          )}
          {message && (
            <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800">
              <Brain className="size-4 shrink-0" />
              {message}
            </div>
          )}
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-sm text-slate-500">
              Cargando programa de producción…
            </div>
          ) : (
            <>
              {kpis && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Unidades hoy</p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-teal-700">{fmtNum(kpis.plannedToday)}</p>
                    <p className="mt-1 text-xs text-slate-500">{kpis.ordersToday} órdenes de fabricación programadas</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">En proceso</p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-amber-600">{kpis.inProcess}</p>
                    <p className="mt-1 text-xs text-slate-500">órdenes con consumo de línea activo</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Completadas · 7 días</p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-emerald-600">{fmtNum(kpis.completedUnits)}</p>
                    <p className="mt-1 text-xs text-slate-500">{kpis.completed} órdenes cerraron con consumo de insumos</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Pendientes de insumos</p>
                    <p className={`mt-3 text-3xl font-bold tracking-tight ${kpis.onHold > 0 ? 'text-red-600' : 'text-slate-950'}`}>{kpis.onHold}</p>
                    <p className="mt-1 text-xs text-slate-500">coordinan con logística de inventarios</p>
                  </div>
                </div>
              )}

              {activeNav === 'programa' && (
                <>
                  <section className="rounded-2xl border border-teal-100 bg-teal-50/60 p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-white p-3 text-teal-700 shadow-sm">
                          <Brain className="size-6" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-slate-950">Programa autónomo a 7 días</h2>
                          <p className="mt-1 max-w-2xl text-sm text-slate-600">
                            Combina el uso proyectado de empaques (motor predictivo de inventarios), el lote aprobado por
                            calidad pendiente de despacho y la capacidad de línea para repartir órdenes de fabricación en
                            turnos de 8 horas. Genera el programa solo; tú decides cuándo iniciar y completar cada orden.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={generate}
                        disabled={busy === 'generar'}
                        className="shrink-0 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {busy === 'generar' ? 'Programando…' : 'Generar programa'}
                      </button>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                      <div>
                        <h3 className="font-bold text-slate-950">Gantt de turnos</h3>
                        <p className="text-sm text-slate-500">Distribución de órdenes por día y turno en las dos líneas.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500">
                        {(Object.entries(STATUS_LABEL) as [OrderStatus, string][]).map(([s, label]) => (
                          <span key={s} className="inline-flex items-center gap-1.5">
                            <span className={`size-2.5 rounded-sm border ${STATUS_CELL[s]}`} />
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[960px] table-fixed text-left">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="w-32 px-4 py-3">
                              <span className="flex items-center gap-1.5">
                                <Clock className="size-3.5" /> Turno
                              </span>
                            </th>
                            {days.map((d) => (
                              <th key={d.key} className="px-3 py-3">
                                <div className="text-center">{d.weekday.toUpperCase()}</div>
                                <div className="text-center font-bold text-slate-600">
                                  {new Date(d.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {shifts.map((s) => (
                            <tr key={s.id}>
                              <td className="px-4 py-3">
                                <p className="text-sm font-bold text-slate-800">{s.label}</p>
                                <p className="text-xs text-slate-400">
                                  {s.start} – {s.end}
                                </p>
                              </td>
                              {days.map((d) => {
                                const cellOrders = byCell.get(`${d.key}|${s.id}`) ?? []
                                return (
                                  <td key={`${d.key}-${s.id}`} className="border-l border-slate-100 px-2 py-2 align-top">
                                    {cellOrders.length === 0 ? (
                                      <p className="py-3 text-center text-xs text-slate-300">—</p>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {cellOrders.map((o) => (
                                          <div key={o.id} className={`rounded-lg border px-2.5 py-2 text-[11px] leading-4 ${STATUS_CELL[o.status]}`}>
                                            <div className="flex items-center justify-between gap-1 font-bold">
                                              <span className="truncate">{o.product}</span>
                                            </div>
                                            <div className="mt-0.5 flex items-center justify-between opacity-80">
                                              <span>{fmtNum(o.units)} uds · {LINE_LABEL[o.line]}</span>
                                            </div>
                                            <div className="mt-0.5 font-mono text-[10px] opacity-70">{o.code}</div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 p-5">
                      <h3 className="font-bold text-slate-950">Órdenes de fabricación</h3>
                      <p className="text-sm text-slate-500">
                        {program.length} órdenes · al completar una se descuenta el BOM del inventario y se crea el lote aprobado en calidad.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1000px] text-left">
                        <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                          <tr>
                            <th className="px-5 py-3">Orden</th>
                            <th className="px-4 py-3">Programada</th>
                            <th className="px-4 py-3">Producto</th>
                            <th className="px-4 py-3 text-right">Unidades</th>
                            <th className="px-4 py-3">Insumos</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {program.map((o) => (
                            <tr key={o.id} className="text-sm hover:bg-slate-50">
                              <td className="px-5 py-4">
                                <p className="font-mono font-bold text-slate-900">{o.code}</p>
                                {o.origin === 'autonomo' && (
                                  <span className="mt-1 inline-flex rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                                    AUTÓNOMA
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <p className="font-semibold text-slate-800">{fmtDateShort(o.scheduledDate)}</p>
                                <p className="text-xs text-slate-400">
                                  {shifts.find((s) => s.id === o.shift)?.label ?? o.shift} · {LINE_LABEL[o.line]}
                                </p>
                              </td>
                              <td className="px-4 py-4">
                                <p className="font-semibold text-slate-800">{o.product}</p>
                                {o.rationale && <p className="mt-1 max-w-xs text-xs leading-4 text-slate-400">{o.rationale}</p>}
                              </td>
                              <td className="px-4 py-4 text-right font-semibold text-slate-800">{fmtNum(o.units)}</td>
                              <td className="px-4 py-4">
                                {o.materialAvailable ? (
                                  <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                    Disponibles
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                                    Requiere reabastecer
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_TONE[o.status]}`}>
                                  {STATUS_LABEL[o.status]}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <NextActions status={o.status} onAction={(s) => mutate({ id: o.id, status: s }, `of-${o.id}`)} busy={busy === `of-${o.id}`} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {pendingBatches.length > 0 && (
                    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
                        <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                          <PackageOpen className="size-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-950">Lotes aprobados pendientes de despacho</h3>
                          <p className="text-sm text-slate-500">
                            Alimentaron la prioridad del programa autónomo y están disponibles en la logística de inventarios.
                          </p>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {pendingBatches.map((b) => (
                          <div key={b.batchId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                            <div>
                              <p className="font-mono text-sm font-bold text-slate-900">{b.batchId}</p>
                              <p className="text-xs text-slate-500">{b.product} · {fmtNum(b.units)} unidades</p>
                            </div>
                            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                              Aprobado por calidad
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                    <p className="flex items-center gap-2">
                      <ArrowRight className="size-4 text-teal-600" />
                      El programa se regenera solo cuando la demanda proyectada o los lotes aprobados cambian. Las órdenes
                      ya iniciadas y completadas se conservan.
                    </p>
                  </div>
                </>
              )}

              {activeNav === 'rendimiento' && (
                <RendimientoView program={program} shifts={shifts} products={products} />
              )}
              {activeNav === 'completadas' && <CompletadasView program={program} shifts={shifts} />}

              {onHoldOrders.length > 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-bold">Hay {onHoldOrders.length} órdenes pendientes de insumos.</p>
                    <p className="mt-1 text-amber-700">
                      {onHoldOrders.map((o) => `${o.code} · ${o.product}`).slice(0, 3).join(' · ')}
                      {onHoldOrders.length > 3 ? ' …' : ''} — coordina el reabastecimiento con el módulo de logística e
                      inventarios.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rendimiento por turno
// ---------------------------------------------------------------------------

function RendimientoView({ program, shifts, products }: { program: ApiOrder[]; shifts: Shift[]; products: ProductCap[] }) {
  const completed = program.filter((o) => o.status === 'completado')

  const byShift = useMemo(() => {
    const map = new Map<string, { label: string; units: number; orders: number }>()
    for (const s of shifts) map.set(s.id, { label: s.label, units: 0, orders: 0 })
    for (const o of completed) {
      const cur = map.get(o.shift)
      if (cur) {
        cur.units += o.units
        cur.orders += 1
      }
    }
    return [...map.values()]
  }, [completed, shifts])

  const byLine = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of completed) map.set(o.line, (map.get(o.line) ?? 0) + o.units)
    return [...map.entries()].map(([line, units]) => ({ line, units }))
  }, [completed])

  const byDay = useMemo(() => {
    const map = new Map<string, { key: string; units: number }>()
    for (const o of completed) {
      const key = new Date(o.completedAt ?? o.scheduledDate).toISOString().slice(0, 10)
      const cur = map.get(key)
      if (cur) cur.units += o.units
      else map.set(key, { key, units: o.units })
    }
    return [...map.values()]
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((d) => ({ label: d.key.slice(5), value: d.units }))
  }, [completed])

  const totalUnits = completed.reduce((s, o) => s + o.units, 0)
  const bestShift = [...byShift].sort((a, b) => b.units - a.units)[0]
  const bestLine = [...byLine].sort((a, b) => b.units - a.units)[0]
  const yieldPerHour = totalUnits / ((completed.length || 1) * 8)
  const capPerShift = (line: 'A' | 'B', product: string) =>
    products.find((p) => p.line === line && p.name === product)?.capacityPerShift ?? 0
  const shiftMaxCap = shifts.reduce(
    (acc, s) => {
      const capacity = completed
        .filter((o) => o.shift === s.id)
        .reduce((sum, o) => sum + Math.max(1, capPerShift(o.line, o.product)), 0)
      acc[s.id] = capacity
      return acc
    },
    {} as Record<string, number>,
  )

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-950 p-3 text-white">
            <Activity className="size-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Rendimiento por turno · últimos 7 días</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Producción cerrada {totalUnits.toLocaleString('es-MX')} unidades en {completed.length} órdenes, medida por
              turno, línea y día. Rendimiento promedio: {nf.format(yieldPerHour)} unidades/hora por orden cerrada.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Turno líder</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-teal-700">{bestShift?.label ?? '—'}</p>
          <p className="mt-1 text-xs text-slate-500">{fmtNum(bestShift?.units ?? 0)} unidades completadas</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Línea líder</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-emerald-600">{LINE_LABEL[bestLine?.line ?? 'A']}</p>
          <p className="mt-1 text-xs text-slate-500">{fmtNum(bestLine?.units ?? 0)} unidades en 7 días</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Órdenes cerradas</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{completed.length}</p>
          <p className="mt-1 text-xs text-slate-500">histórico generado por el motor autónomo</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Rend. promedio</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-amber-600">{nf.format(yieldPerHour)}</p>
          <p className="mt-1 text-xs text-slate-500">unidades/hora por orden completada</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Por turno</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">Unidades completadas</h3>
          <div className="mt-6">
            <Bars data={byShift.map((s) => ({ label: s.label, value: s.units }))} />
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {byShift.map((s) => (
              <div key={s.label} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-semibold text-slate-700">{s.label}</span>
                <span className="text-slate-500">
                  {fmtNum(s.units)} uds · {s.orders} órdenes
                  {shiftMaxCap[s.label] ? ` · util. ${Math.min(100, Math.round((s.units / shiftMaxCap[s.label]) * 100))}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Por día</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">Producción de los últimos 7 días</h3>
          <div className="mt-6">
            <Bars data={byDay} tone="bg-emerald-600" />
          </div>
          <div className="mt-4 space-y-2.5">
            {byLine.map((l) => (
              <div key={l.line} className="flex items-center gap-3 text-sm">
                <span className="w-44 text-slate-600">{LINE_LABEL[l.line]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{ width: `${totalUnits ? (l.units / totalUnits) * 100 : 0}%` }}
                  />
                </div>
                <span className="font-semibold text-slate-800">{fmtNum(l.units)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-5">
          <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-950">Detalle por turno</h3>
            <p className="text-sm text-slate-500">Concentrado histórico de producción cerrada por turno.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Turno</th>
                <th className="px-4 py-3">Horario</th>
                <th className="px-4 py-3 text-right">Órdenes</th>
                <th className="px-4 py-3 text-right">Unidades</th>
                <th className="px-4 py-3 text-right">Promedio por orden</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {byShift.map((s) => (
                <tr key={s.label} className="text-sm hover:bg-slate-50">
                  <td className="px-5 py-4 font-bold text-slate-800">{s.label}</td>
                  <td className="px-4 py-4 text-xs text-slate-500">
                    {shifts.find((x) => x.label === s.label)?.start} – {shifts.find((x) => x.label === s.label)?.end}
                  </td>
                  <td className="px-4 py-4 text-right text-slate-600">{s.orders}</td>
                  <td className="px-4 py-4 text-right font-semibold text-slate-800">{fmtNum(s.units)}</td>
                  <td className="px-4 py-4 text-right text-slate-600">
                    {s.orders ? fmtNum(Math.round(s.units / s.orders)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Órdenes completadas
// ---------------------------------------------------------------------------

function CompletadasView({ program, shifts }: { program: ApiOrder[]; shifts: Shift[] }) {
  const completed = useMemo(
    () =>
      program
        .filter((o) => o.status === 'completado')
        .sort((a, b) => (a.completedAt && b.completedAt ? b.completedAt.localeCompare(a.completedAt) : 0)),
    [program],
  )
  const totalUnits = completed.reduce((s, o) => s + o.units, 0)
  const last7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const week7 = completed.filter((o) => (o.completedAt ?? o.scheduledDate).slice(0, 10) >= last7)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
            <BarChart3 className="size-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Órdenes de fabricación completadas</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {week7.length} órdenes cerradas en los últimos 7 días · {fmtNum(totalUnits)} unidades totales · promedio de{' '}
              {fmtNum(Math.round(totalUnits / Math.max(1, week7.length)))} unidades por orden.
            </p>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h3 className="font-bold text-slate-950">Registro de cierre</h3>
          <p className="text-sm text-slate-500">
            Ordenadas por fecha de cierre. Cada cierre consume el BOM del inventario y abre el lote en control de calidad.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Orden</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Unidades</th>
                <th className="px-4 py-3">Turno</th>
                <th className="px-4 py-3">Línea</th>
                <th className="px-4 py-3">Cerrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {completed.map((o) => (
                <tr key={o.id} className="text-sm hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-mono font-bold text-slate-900">{o.code}</p>
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-800">{o.product}</td>
                  <td className="px-4 py-4 text-right font-semibold text-slate-800">{fmtNum(o.units)}</td>
                  <td className="px-4 py-4 text-slate-600">{shifts.find((s) => s.id === o.shift)?.label ?? o.shift}</td>
                  <td className="px-4 py-4 text-slate-600">{LINE_LABEL[o.line]}</td>
                  <td className="px-4 py-4 text-xs text-slate-500">{fmtDateTime(o.completedAt ?? o.scheduledDate)}</td>
                </tr>
              ))}
              {completed.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                    Aún no hay órdenes completadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}