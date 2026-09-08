'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Brain,
  ChevronDown,
  ClipboardList,
  Layers,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  Warehouse,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Tipos que devuelve la API
// ---------------------------------------------------------------------------

type Risk = 'critico' | 'alto' | 'medio' | 'ok'

type Material = {
  id: number
  sku: string
  name: string
  category: string
  unit: string
  stock: string
  safetyStock: string
  reorderPoint: string | null
  leadTimeDays: number
  unitCost: string
  supplier: string | null
  active: boolean
  stockNum: number
  unitCostNum: number
  inventoryValue: number
  dailyUse: number
  trendPerDay: number
  coverageDays: number | 'Infinity'
  dynamicRop: number
  effectiveRop: number
  stockoutDate: string | null
  risk: Risk
  shouldOrder: boolean
  suggestedQty: number
  rationale: string
}

type Movement = {
  id: number
  materialId: number
  materialName: string | null
  unit: string | null
  type: 'entrada' | 'salida' | 'ajuste'
  quantity: string
  balanceAfter: string
  reason: string | null
  reference: string | null
  createdAt: string
}

type PurchaseOrder = {
  id: number
  code: string
  materialId: number
  materialName: string | null
  unit: string | null
  quantity: string
  unitCost: string
  supplier: string | null
  status: 'sugerida' | 'aprobada' | 'en_transito' | 'recibida' | 'cancelada'
  origin: 'manual' | 'ia'
  rationale: string | null
  expectedAt: string | null
  createdAt: string
}

type Shipment = {
  id: number
  code: string
  batchId: string
  product: string
  units: number
  destination: string
  carrier: string | null
  status: 'preparacion' | 'en_transito' | 'entregado' | 'bloqueado'
  dispatchedAt: string | null
  deliveredAt: string | null
  createdAt: string
}

type ReadyBatch = { batchId: string; product: string; units: number; createdAt: string }

type Overview = {
  kpis: {
    inventoryValue: number
    materialsTotal: number
    materialsAtRisk: number
    avgCoverageDays: number
    openPos: number
    openPoValue: number
    shipmentsInTransit: number
    shipmentsPreparing: number
  }
  consumptionSeries: { day: string; qty: number }[]
  valueByCategory: { category: string; value: number }[]
  topAlerts: {
    materialId: number
    sku: string
    name: string
    unit: string
    stock: number
    coverageDays: number | 'Infinity'
    stockoutDate: string | null
    suggestedQty: number
    unitCost: number
    risk: Risk
    rationale: string
  }[]
}

// ---------------------------------------------------------------------------
// Utilidades de formato
// ---------------------------------------------------------------------------

const nf = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })

const fmtNum = (n: number | string) => nf.format(Number(n) || 0)
const fmtMoney = (n: number | string) => `$${nf.format(Math.round(Number(n) || 0))}`
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—'
const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

const coverageLabel = (c: number | 'Infinity') =>
  c === 'Infinity' || !Number.isFinite(c as number) ? 'sin consumo' : `${nf1.format(c as number)} d`

const CATEGORY_LABEL: Record<string, string> = {
  tensioactivo: 'Tensioactivo',
  builder: 'Builder',
  fragancia: 'Fragancia',
  colorante: 'Colorante',
  conservante: 'Conservante',
  envase: 'Envase',
  etiqueta: 'Etiqueta',
  otro: 'Otro',
}

// ---------------------------------------------------------------------------
// Componentes de presentación
// ---------------------------------------------------------------------------

const NAV = [
  { label: 'Resumen', icon: LayoutDashboard },
  { label: 'Inventario', icon: Warehouse },
  { label: 'Movimientos', icon: Layers },
  { label: 'Órdenes de compra', icon: ShoppingCart },
  { label: 'Despachos', icon: Truck },
] as const

type NavLabel = (typeof NAV)[number]['label']

function Metric({ label, value, sub, tone = 'slate' }: { label: string; value: string; sub?: string; tone?: 'slate' | 'teal' | 'red' | 'amber' | 'emerald' }) {
  const tones = {
    slate: 'text-slate-950',
    teal: 'text-teal-700',
    red: 'text-red-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-3 text-3xl font-bold tracking-tight ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

function RiskPill({ risk }: { risk: Risk }) {
  const map: Record<Risk, [string, string]> = {
    critico: ['bg-red-50 text-red-700 ring-red-200', 'Crítico'],
    alto: ['bg-amber-50 text-amber-700 ring-amber-200', 'Alto'],
    medio: ['bg-yellow-50 text-yellow-700 ring-yellow-200', 'Medio'],
    ok: ['bg-emerald-50 text-emerald-700 ring-emerald-200', 'OK'],
  }
  const [cls, label] = map[risk]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cls}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

function Tag({ children, tone }: { children: React.ReactNode; tone: 'slate' | 'teal' | 'amber' | 'emerald' | 'red' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  }
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

const PO_STATUS_TONE: Record<PurchaseOrder['status'], 'slate' | 'teal' | 'amber' | 'emerald' | 'red'> = {
  sugerida: 'slate',
  aprobada: 'teal',
  en_transito: 'amber',
  recibida: 'emerald',
  cancelada: 'red',
}
const PO_STATUS_LABEL: Record<PurchaseOrder['status'], string> = {
  sugerida: 'Sugerida',
  aprobada: 'Aprobada',
  en_transito: 'En tránsito',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
}

const SHIP_STATUS_TONE: Record<Shipment['status'], 'slate' | 'amber' | 'emerald' | 'red'> = {
  preparacion: 'slate',
  en_transito: 'amber',
  entregado: 'emerald',
  bloqueado: 'red',
}
const SHIP_STATUS_LABEL: Record<Shipment['status'], string> = {
  preparacion: 'En preparación',
  en_transito: 'En tránsito',
  entregado: 'Entregado',
  bloqueado: 'Bloqueado',
}

function Bars({ data, unitLabel }: { data: { label: string; value: number }[]; unitLabel?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex h-40 items-end gap-1.5 border-b border-l border-slate-200 px-2 pb-0 pt-4">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div
            className="w-full rounded-t bg-teal-600 transition group-hover:bg-teal-500"
            style={{ height: `${(d.value / max) * 100}%` }}
            title={`${d.label}: ${fmtNum(d.value)}${unitLabel ? ` ${unitLabel}` : ''}`}
          />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function LogisticsDashboard() {
  const [activeNav, setActiveNav] = useState<NavLabel>('Resumen')
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [materials, setMaterials] = useState<Material[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [readyBatches, setReadyBatches] = useState<ReadyBatch[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)

  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<'todos' | Risk>('todos')
  const [suggestResult, setSuggestResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [m, mv, po, sh, ov] = await Promise.all([
        fetch('/api/logistica/materials').then((r) => r.json()),
        fetch('/api/logistica/movements').then((r) => r.json()),
        fetch('/api/logistica/purchase-orders').then((r) => r.json()),
        fetch('/api/logistica/shipments').then((r) => r.json()),
        fetch('/api/logistica/overview').then((r) => r.json()),
      ])
      setMaterials(Array.isArray(m) ? m : [])
      setMovements(Array.isArray(mv) ? mv : [])
      setPos(Array.isArray(po) ? po : [])
      setShipments(sh?.shipments ?? [])
      setReadyBatches(sh?.readyBatches ?? [])
      setOverview(ov && ov.kpis ? ov : null)
      setError(null)
    } catch {
      setError('No se pudo cargar la información de logística.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const mutate = useCallback(
    async (url: string, method: string, body: unknown, key: string) => {
      setBusy(key)
      setError(null)
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
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

  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase()
    return materials.filter(
      (m) =>
        (riskFilter === 'todos' || m.risk === riskFilter) &&
        `${m.sku} ${m.name} ${m.category}`.toLowerCase().includes(q),
    )
  }, [materials, search, riskFilter])

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
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Logística</p>
          </div>
        </Link>
        <nav className="space-y-1 px-3 py-6">
          {NAV.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => {
                setActiveNav(label)
                setMenuOpen(false)
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
                activeNav === label ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="size-[18px]" />
              {label}
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
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Cadena de suministro</p>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950">{activeNav}</h1>
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
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-sm text-slate-500">
              Cargando módulo de logística…
            </div>
          ) : (
            <>
              {activeNav === 'Resumen' && <ResumenView overview={overview} materials={materials} onCreatePo={(a) => mutate('/api/logistica/purchase-orders', 'POST', { materialId: a.materialId, quantity: a.suggestedQty, origin: 'ia', rationale: a.rationale, status: 'aprobada' }, `alert-${a.materialId}`)} busy={busy} onGoto={setActiveNav} />}
              {activeNav === 'Inventario' && (
                <InventarioView
                  materials={filteredMaterials}
                  totalCount={materials.length}
                  search={search}
                  setSearch={setSearch}
                  riskFilter={riskFilter}
                  setRiskFilter={setRiskFilter}
                  onCreate={(body) => mutate('/api/logistica/materials', 'POST', body, 'new-material')}
                  busy={busy}
                />
              )}
              {activeNav === 'Movimientos' && (
                <MovimientosView
                  materials={materials}
                  movements={movements}
                  onSubmit={(body) => mutate('/api/logistica/movements', 'POST', body, 'new-movement')}
                  busy={busy}
                />
              )}
              {activeNav === 'Órdenes de compra' && (
                <ComprasView
                  pos={pos}
                  suggestResult={suggestResult}
                  onSuggest={async () => {
                    setBusy('suggest')
                    setError(null)
                    try {
                      const res = await fetch('/api/logistica/purchase-orders/suggest', { method: 'POST' })
                      const data = await res.json()
                      if (!res.ok) setError(data.error ?? 'No se pudo generar sugerencias.')
                      else {
                        const n = data.created?.length ?? 0
                        setSuggestResult(
                          n === 0
                            ? data.message ?? 'El motor no encontró insumos que requieran reorden.'
                            : `El motor predictivo generó ${n} orden${n === 1 ? '' : 'es'} de compra.${data.skipped?.length ? ` Omitidos (ya tienen OC abierta): ${data.skipped.join(', ')}.` : ''}`,
                        )
                        await load()
                      }
                    } catch {
                      setError('Error de red.')
                    } finally {
                      setBusy(null)
                    }
                  }}
                  onStatus={(id, status) => mutate('/api/logistica/purchase-orders', 'PATCH', { id, status }, `po-${id}`)}
                  busy={busy}
                />
              )}
              {activeNav === 'Despachos' && (
                <DespachosView
                  shipments={shipments}
                  readyBatches={readyBatches}
                  onCreate={(batchId) => mutate('/api/logistica/shipments', 'POST', { batchId }, `ship-${batchId}`)}
                  onStatus={(id, status) => mutate('/api/logistica/shipments', 'PATCH', { id, status }, `ship-${id}`)}
                  busy={busy}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

function ResumenView({
  overview,
  materials,
  onCreatePo,
  busy,
  onGoto,
}: {
  overview: Overview | null
  materials: Material[]
  onCreatePo: (alert: Overview['topAlerts'][number]) => void
  busy: string | null
  onGoto: (n: NavLabel) => void
}) {
  if (!overview) return <p className="text-sm text-slate-500">Sin datos de resumen.</p>
  const k = overview.kpis
  const series = overview.consumptionSeries.map((d) => ({ label: d.day.slice(5), value: d.qty }))
  const catMax = Math.max(1, ...overview.valueByCategory.map((c) => c.value))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Valor de inventario" value={fmtMoney(k.inventoryValue)} sub={`${k.materialsTotal} insumos activos`} tone="teal" />
        <Metric label="Insumos en riesgo" value={String(k.materialsAtRisk)} sub="crítico o alto" tone={k.materialsAtRisk > 0 ? 'red' : 'emerald'} />
        <Metric label="Órdenes abiertas" value={String(k.openPos)} sub={`${fmtMoney(k.openPoValue)} comprometidos`} tone="amber" />
        <Metric label="Despachos activos" value={String(k.shipmentsInTransit + k.shipmentsPreparing)} sub={`${k.shipmentsInTransit} en tránsito`} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-teal-50 p-2 text-teal-700">
              <Brain className="size-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-950">Alertas predictivas de reabastecimiento</h2>
              <p className="text-sm text-slate-500">
                El motor estima consumo, días de cobertura y cantidad a ordenar por insumo.
              </p>
            </div>
          </div>
          <button onClick={() => onGoto('Órdenes de compra')} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700">
            Ver órdenes de compra
          </button>
        </div>
        {overview.topAlerts.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Ningún insumo requiere reorden. Cobertura promedio: {nf1.format(k.avgCoverageDays)} días.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {overview.topAlerts.map((a) => (
              <div key={a.materialId} className="grid gap-3 px-5 py-4 md:grid-cols-[1.4fr_1fr_1.6fr_auto] md:items-center">
                <div>
                  <p className="text-sm font-bold text-slate-900">{a.name}</p>
                  <p className="font-mono text-xs text-slate-400">{a.sku}</p>
                </div>
                <div className="text-xs text-slate-600">
                  <p>
                    <span className="font-semibold text-slate-800">Cobertura:</span> {coverageLabel(a.coverageDays)}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-800">Quiebre:</span> {fmtDate(a.stockoutDate)}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <RiskPill risk={a.risk} />
                  <p className="text-xs leading-5 text-slate-500">{a.rationale}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <p className="text-sm font-bold text-teal-700">
                    Ordenar {fmtNum(a.suggestedQty)} {a.unit}
                  </p>
                  <button
                    onClick={() => onCreatePo(a)}
                    disabled={busy === `alert-${a.materialId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                  >
                    {busy === `alert-${a.materialId}` ? 'Creando…' : 'Crear orden'} <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Consumo agregado</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">Salidas de inventario · últimos 30 días</h2>
          <div className="mt-6">
            <Bars data={series} />
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Distribución</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">Valor de inventario por categoría</h2>
          <div className="mt-5 space-y-3">
            {overview.valueByCategory.map((c) => (
              <div key={c.category}>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                  <span>{fmtMoney(c.value)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-teal-600" style={{ width: `${(c.value / catMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-xs text-slate-400">
        Insumos con más rotación: {[...materials].sort((a, b) => b.dailyUse - a.dailyUse).slice(0, 3).map((m) => m.name).join(' · ') || '—'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

function InventarioView({
  materials,
  totalCount,
  search,
  setSearch,
  riskFilter,
  setRiskFilter,
  onCreate,
  busy,
}: {
  materials: Material[]
  totalCount: number
  search: string
  setSearch: (v: string) => void
  riskFilter: 'todos' | Risk
  setRiskFilter: (v: 'todos' | Risk) => void
  onCreate: (body: Record<string, unknown>) => Promise<unknown>
  busy: string | null
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ sku: '', name: '', category: 'tensioactivo', unit: 'kg', stock: '', unitCost: '', safetyStock: '', leadTimeDays: '7', supplier: '' })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-bold text-slate-950">Inventario de insumos</h2>
            <p className="text-sm text-slate-500">
              {materials.length} de {totalCount} insumos · punto de reorden calculado por el motor predictivo
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar insumo…"
                className="h-9 w-48 rounded-lg border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-teal-500"
              />
            </div>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as 'todos' | Risk)}
              className="h-9 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-teal-500"
            >
              <option value="todos">Todo riesgo</option>
              <option value="critico">Crítico</option>
              <option value="alto">Alto</option>
              <option value="medio">Medio</option>
              <option value="ok">OK</option>
            </select>
            <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700">
              <Plus className="size-4" /> Nuevo insumo
            </button>
          </div>
        </div>

        {open && (
          <div className="border-b border-slate-100 bg-slate-50/60 p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="SKU" className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nombre" className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 sm:col-span-2 lg:col-span-1" />
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-teal-500">
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <select value={form.unit} onChange={(e) => set('unit', e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-teal-500">
                <option value="kg">kg</option>
                <option value="L">L</option>
                <option value="unidad">unidad</option>
              </select>
              <input value={form.stock} onChange={(e) => set('stock', e.target.value)} placeholder="Stock inicial" type="number" className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
              <input value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} placeholder="Costo unitario" type="number" className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
              <input value={form.safetyStock} onChange={(e) => set('safetyStock', e.target.value)} placeholder="Stock de seguridad" type="number" className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
              <input value={form.leadTimeDays} onChange={(e) => set('leadTimeDays', e.target.value)} placeholder="Lead time (días)" type="number" className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
              <input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} placeholder="Proveedor" className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 sm:col-span-2" />
            </div>
            <div className="mt-3 flex justify-end">
              <button
                disabled={busy === 'new-material'}
                onClick={async () => {
                  const ok = await onCreate({
                    sku: form.sku,
                    name: form.name,
                    category: form.category,
                    unit: form.unit,
                    stock: Number(form.stock) || 0,
                    unitCost: Number(form.unitCost) || 0,
                    safetyStock: Number(form.safetyStock) || 0,
                    leadTimeDays: Number(form.leadTimeDays) || 7,
                    supplier: form.supplier,
                  })
                  if (ok) {
                    setForm({ sku: '', name: '', category: 'tensioactivo', unit: 'kg', stock: '', unitCost: '', safetyStock: '', leadTimeDays: '7', supplier: '' })
                    setOpen(false)
                  }
                }}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busy === 'new-material' ? 'Guardando…' : 'Guardar insumo'}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Insumo</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Cobertura</th>
                <th className="px-4 py-3 text-right">Reorden</th>
                <th className="px-4 py-3 text-right">Uso/día</th>
                <th className="px-4 py-3">Riesgo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {materials.map((m) => (
                <tr key={m.id} className="text-sm hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{m.name}</p>
                    <p className="font-mono text-xs text-slate-400">{m.sku} · {m.supplier ?? 'sin proveedor'}</p>
                  </td>
                  <td className="px-4 py-4"><Tag tone="slate">{CATEGORY_LABEL[m.category] ?? m.category}</Tag></td>
                  <td className="px-4 py-4 text-right font-semibold text-slate-800">
                    {fmtNum(m.stockNum)} <span className="text-xs font-normal text-slate-400">{m.unit}</span>
                  </td>
                  <td className="px-4 py-4 text-right text-slate-600">{coverageLabel(m.coverageDays)}</td>
                  <td className="px-4 py-4 text-right text-slate-600">
                    {fmtNum(m.effectiveRop)}
                    {m.reorderPoint == null && <span className="ml-1 text-[10px] font-bold uppercase text-teal-600">din.</span>}
                  </td>
                  <td className="px-4 py-4 text-right text-slate-600">
                    {nf1.format(m.dailyUse)}
                    {m.trendPerDay > 0.05 && <span className="ml-1 text-emerald-600">↑</span>}
                    {m.trendPerDay < -0.05 && <span className="ml-1 text-red-500">↓</span>}
                  </td>
                  <td className="px-4 py-4"><RiskPill risk={m.risk} /></td>
                </tr>
              ))}
              {materials.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    Sin insumos que coincidan con el filtro.
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

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

function MovimientosView({
  materials,
  movements,
  onSubmit,
  busy,
}: {
  materials: Material[]
  movements: Movement[]
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>
  busy: string | null
}) {
  const [form, setForm] = useState({ materialId: '', type: 'salida', quantity: '', reason: '', reference: '' })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-teal-50 p-2 text-teal-700">
            <ClipboardList className="size-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-950">Registrar movimiento</h2>
            <p className="text-sm text-slate-500">Entrada, consumo de producción o ajuste de conteo físico.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select value={form.materialId} onChange={(e) => set('materialId', e.target.value)} className="h-10 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-teal-500 lg:col-span-2">
            <option value="">Selecciona insumo…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({fmtNum(m.stockNum)} {m.unit})</option>
            ))}
          </select>
          <select value={form.type} onChange={(e) => set('type', e.target.value)} className="h-10 rounded-lg border border-slate-200 px-2 text-sm outline-none focus:border-teal-500">
            <option value="salida">Salida</option>
            <option value="entrada">Entrada</option>
            <option value="ajuste">Ajuste</option>
          </select>
          <input value={form.quantity} onChange={(e) => set('quantity', e.target.value)} type="number" placeholder={form.type === 'ajuste' ? 'Stock real' : 'Cantidad'} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
          <input value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Referencia (OF, OC…)" className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Motivo (opcional)" className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-teal-500" />
          <button
            disabled={busy === 'new-movement' || !form.materialId || form.quantity === ''}
            onClick={async () => {
              const ok = await onSubmit({
                materialId: Number(form.materialId),
                type: form.type,
                quantity: Number(form.quantity),
                reason: form.reason,
                reference: form.reference,
              })
              if (ok) setForm({ materialId: '', type: 'salida', quantity: '', reason: '', reference: '' })
            }}
            className="h-10 rounded-lg bg-slate-950 px-5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy === 'new-movement' ? 'Registrando…' : 'Registrar'}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h3 className="font-bold text-slate-950">Kardex</h3>
          <p className="text-sm text-slate-500">Últimos {movements.length} movimientos.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-4 py-3">Insumo</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3">Referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id} className="text-sm hover:bg-slate-50">
                  <td className="px-5 py-3 text-xs text-slate-500">{fmtDateTime(m.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-700">{m.materialName ?? `#${m.materialId}`}</td>
                  <td className="px-4 py-3">
                    <Tag tone={m.type === 'entrada' ? 'emerald' : m.type === 'salida' ? 'red' : 'slate'}>
                      {m.type === 'entrada' ? 'Entrada' : m.type === 'salida' ? 'Salida' : 'Ajuste'}
                    </Tag>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {m.type === 'salida' ? '−' : m.type === 'entrada' ? '+' : ''}
                    {fmtNum(m.quantity)} <span className="text-xs font-normal text-slate-400">{m.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtNum(m.balanceAfter)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{m.reference ?? m.reason ?? '—'}</td>
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
// Órdenes de compra
// ---------------------------------------------------------------------------

function ComprasView({
  pos,
  suggestResult,
  onSuggest,
  onStatus,
  busy,
}: {
  pos: PurchaseOrder[]
  suggestResult: string | null
  onSuggest: () => void
  onStatus: (id: number, status: PurchaseOrder['status']) => void
  busy: string | null
}) {
  const NEXT: Partial<Record<PurchaseOrder['status'], { label: string; status: PurchaseOrder['status'] }[]>> = {
    sugerida: [
      { label: 'Aprobar', status: 'aprobada' },
      { label: 'Descartar', status: 'cancelada' },
    ],
    aprobada: [
      { label: 'Marcar enviada', status: 'en_transito' },
      { label: 'Cancelar', status: 'cancelada' },
    ],
    en_transito: [{ label: 'Marcar recibida', status: 'recibida' }],
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-teal-100 bg-teal-50/60 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-3 text-teal-700 shadow-sm">
              <Brain className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-950">Motor predictivo de compras</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Analiza el consumo histórico de cada insumo, proyecta la demanda del lead time y genera órdenes de
                compra sugeridas para los que van a quebrar stock.
              </p>
            </div>
          </div>
          <button
            onClick={onSuggest}
            disabled={busy === 'suggest'}
            className="shrink-0 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy === 'suggest' ? 'Analizando…' : 'Generar sugerencias'}
          </button>
        </div>
        {suggestResult && (
          <p className="mt-4 rounded-lg border border-teal-200 bg-white px-4 py-3 text-sm font-semibold text-teal-800">
            {suggestResult}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h3 className="font-bold text-slate-950">Órdenes de compra</h3>
          <p className="text-sm text-slate-500">{pos.length} registradas.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {pos.map((po) => (
            <div key={po.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_1.4fr_1fr_auto] lg:items-center">
              <div>
                <p className="font-mono text-sm font-bold text-slate-900">{po.code}</p>
                <p className="text-xs text-slate-500">{fmtDate(po.createdAt)}</p>
                {po.origin === 'ia' && <Tag tone="teal">IA</Tag>}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{po.materialName ?? `#${po.materialId}`}</p>
                <p className="text-xs text-slate-500">
                  {fmtNum(po.quantity)} {po.unit} · {fmtMoney(Number(po.quantity) * Number(po.unitCost))} · {po.supplier ?? 'sin proveedor'}
                </p>
                {po.rationale && <p className="mt-1 text-xs leading-5 text-slate-400">{po.rationale}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Tag tone={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Tag>
                {po.expectedAt && po.status !== 'recibida' && po.status !== 'cancelada' && (
                  <span className="text-xs text-slate-400">ETA {fmtDate(po.expectedAt)}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(NEXT[po.status] ?? []).map((action) => (
                  <button
                    key={action.status}
                    onClick={() => onStatus(po.id, action.status)}
                    disabled={busy === `po-${po.id}`}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {pos.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Sin órdenes de compra.</div>}
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Despachos
// ---------------------------------------------------------------------------

function DespachosView({
  shipments,
  readyBatches,
  onCreate,
  onStatus,
  busy,
}: {
  shipments: Shipment[]
  readyBatches: ReadyBatch[]
  onCreate: (batchId: string) => void
  onStatus: (id: number, status: Shipment['status']) => void
  busy: string | null
}) {
  const NEXT: Partial<Record<Shipment['status'], { label: string; status: Shipment['status'] }[]>> = {
    preparacion: [{ label: 'Despachar', status: 'en_transito' }],
    en_transito: [{ label: 'Marcar entregado', status: 'entregado' }],
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-5">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
            <PackageCheck className="size-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-950">Lotes aprobados listos para despacho</h2>
            <p className="text-sm text-slate-500">Provienen de control de calidad. Los lotes PNC no aparecen aquí.</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {readyBatches.map((b) => (
            <div key={b.batchId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-mono text-sm font-bold text-slate-900">{b.batchId}</p>
                <p className="text-xs text-slate-500">{b.product} · {fmtNum(b.units)} unidades · aprobado {fmtDate(b.createdAt)}</p>
              </div>
              <button
                onClick={() => onCreate(b.batchId)}
                disabled={busy === `ship-${b.batchId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                <Truck className="size-4" /> {busy === `ship-${b.batchId}` ? 'Creando…' : 'Crear envío'}
              </button>
            </div>
          ))}
          {readyBatches.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">No hay lotes aprobados pendientes de despacho.</div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h3 className="font-bold text-slate-950">Envíos al CEDI</h3>
          <p className="text-sm text-slate-500">{shipments.length} registrados.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3">Envío</th>
                <th className="px-4 py-3">Lote / producto</th>
                <th className="px-4 py-3 text-right">Unidades</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shipments.map((s) => (
                <tr key={s.id} className="text-sm hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-mono font-bold text-slate-900">{s.code}</p>
                    <p className="text-xs text-slate-400">{s.carrier ?? 'sin transportista'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs font-bold text-slate-700">{s.batchId}</p>
                    <p className="text-xs text-slate-500">{s.product}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmtNum(s.units)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {s.destination}
                    {s.dispatchedAt && <div>Salida {fmtDate(s.dispatchedAt)}</div>}
                    {s.deliveredAt && <div>Entrega {fmtDate(s.deliveredAt)}</div>}
                  </td>
                  <td className="px-4 py-3"><Tag tone={SHIP_STATUS_TONE[s.status]}>{SHIP_STATUS_LABEL[s.status]}</Tag></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {(NEXT[s.status] ?? []).map((action) => (
                        <button
                          key={action.status}
                          onClick={() => onStatus(s.id, action.status)}
                          disabled={busy === `ship-${s.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {shipments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">Sin envíos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
