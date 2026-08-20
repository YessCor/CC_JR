'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  PackageCheck,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Truck,
  XCircle,
} from 'lucide-react'

type Batch = {
  id: string
  product: string
  date: string
  deviation: string
  value: string
  status: 'Aprobado' | 'Bloqueado' | 'En revisión'
  notes?: string
}

const initialBatches: Batch[] = [
  { id: 'L-240812-07', product: 'Detergente líquido 3L', date: '12 ago, 2024 · 10:42', deviation: 'pH fuera de rango', value: 'pH 10.8', status: 'Bloqueado' },
  { id: 'L-240811-03', product: 'Suavizante floral 1L', date: '11 ago, 2024 · 16:18', deviation: 'Densidad fuera de rango', value: '1.042 g/mL', status: 'Bloqueado' },
  { id: 'L-240810-11', product: 'Detergente polvo 500g', date: '10 ago, 2024 · 09:27', deviation: 'Muestra pendiente', value: '—', status: 'En revisión' },
]

const navItems = [
  { label: 'Resumen', icon: LayoutDashboard, active: true },
  { label: 'Captura de resultados', icon: ClipboardCheck },
  { label: 'Cuarentena / PNC', icon: ShieldAlert, count: '3' },
  { label: 'Historial de lotes', icon: PackageCheck },
]

function StatusPill({ status }: { status: 'Aprobado' | 'Bloqueado' | 'En revisión' }) {
  const styles = {
    Aprobado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    Bloqueado: 'bg-red-50 text-red-700 ring-red-200',
    'En revisión': 'bg-amber-50 text-amber-700 ring-amber-200',
  }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[status]}`}><span className="size-1.5 rounded-full bg-current" />{status}</span>
}

function ModuleHeader({ eyebrow, title, description, icon: Icon, tone = 'teal' }: { eyebrow: string; title: string; description: string; icon: typeof ClipboardCheck; tone?: 'teal' | 'red' | 'slate' }) {
  const tones = { teal: 'bg-teal-50 text-teal-700 border-teal-100', red: 'bg-red-50 text-red-700 border-red-100', slate: 'bg-slate-100 text-slate-700 border-slate-200' }
  return <section className={`rounded-2xl border p-6 ${tones[tone]}`}><div className="flex items-start gap-4"><div className="rounded-xl bg-white p-3 shadow-sm"><Icon className="size-6" /></div><div><p className="text-xs font-bold uppercase tracking-[0.16em]">{eyebrow}</p><h2 className="mt-1 text-2xl font-bold text-slate-950">{title}</h2><p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p></div></div></section>
}

function MetricCard({ label, value, helper, tone = 'teal' }: { label: string; value: string; helper: string; tone?: 'teal' | 'red' | 'amber' }) {
  const colors = { teal: 'text-teal-700 bg-teal-50', red: 'text-red-700 bg-red-50', amber: 'text-amber-700 bg-amber-50' }
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-3 text-3xl font-bold text-slate-950">{value}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${colors[tone]}`}>{helper}</span></div>
}

function PncDashboard({ batches, visibleBatches, search, setSearch, showOnlyPnc, setShowOnlyPnc, setActiveNav }: { batches: Batch[]; visibleBatches: Batch[]; search: string; setSearch: (v: string) => void; showOnlyPnc: boolean; setShowOnlyPnc: (v: boolean) => void; setActiveNav: (v: string) => void }) {
  const demoPnc: Batch[] = [
    { id: 'L-240814-05', product: 'Detergente líquido 3L', date: '14 ago, 2024 · 08:16', deviation: 'pH alto', value: 'pH 10.6', status: 'Bloqueado' },
    { id: 'L-240813-09', product: 'Suavizante floral 1L', date: '13 ago, 2024 · 15:44', deviation: 'Densidad baja', value: '0.971 g/mL', status: 'Bloqueado' },
    { id: 'L-240812-12', product: 'Detergente polvo 500g', date: '12 ago, 2024 · 12:08', deviation: 'Muestra con sedimentos', value: 'Inspección visual', status: 'Bloqueado' },
  ]
  const pnc = [...visibleBatches.filter((batch) => batch.status === 'Bloqueado'), ...demoPnc].filter((batch) => `${batch.id} ${batch.product}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="space-y-6"><ModuleHeader eyebrow="Aislamiento preventivo" title="Cuarentena / Producto No Conforme" description="Control visual de lotes retenidos, desviaciones analíticas y disposición pendiente. Todos los datos de esta vista son demostrativos." icon={ShieldAlert} tone="red" /><div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Lotes retenidos" value={String(batches.filter((b) => b.status === 'Bloqueado').length)} helper="requieren decisión" tone="red" /><MetricCard label="Envíos bloqueados" value="100%" helper="CEDI protegido" /><MetricCard label="Tiempo de respuesta" value="02:14 h" helper="promedio de turno" tone="amber" /></div><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h3 className="font-bold text-slate-950">Cola de cuarentena</h3><p className="mt-1 text-sm text-slate-500">Vista de presentación con datos ficticios.</p></div><div className="flex gap-2"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar lote" className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /><button onClick={() => setShowOnlyPnc(!showOnlyPnc)} className="rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700">{showOnlyPnc ? 'Mostrando PNC' : 'Filtrar PNC'}</button><button onClick={() => setActiveNav('Historial de lotes')} className="rounded-lg bg-slate-950 px-3 text-xs font-bold text-white">Historial</button></div></div><div className="divide-y divide-slate-100">{pnc.length ? pnc.map((batch) => <div key={batch.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1.5fr_1fr_auto] md:items-center"><div><p className="font-mono text-sm font-bold text-slate-900">{batch.id}</p><p className="text-xs text-slate-500">{batch.date}</p></div><div><p className="text-sm font-semibold text-slate-800">{batch.product}</p><p className="text-xs text-red-600">{batch.deviation} · {batch.value}</p></div><div className="text-xs text-slate-500"><span className="font-semibold text-slate-700">Destino:</span> CEDI bloqueado</div><StatusPill status="Bloqueado" /></div>) : <div className="p-10 text-center text-sm text-slate-500">No hay lotes PNC para mostrar con este filtro.</div>}</div></section></div>
}

function HistoryDashboard({ batches, search, setSearch }: { batches: Batch[]; search: string; setSearch: (v: string) => void }) {
  const demo = [{ id: 'L-240809-04', product: 'Detergente líquido 3L', date: '09 ago, 2024 · 14:05', deviation: '—', value: 'pH 8.1 · 1.026 g/mL', status: 'Aprobado' as const }, { id: 'L-240808-09', product: 'Suavizante floral 1L', date: '08 ago, 2024 · 11:32', deviation: '—', value: 'pH 7.8 · 1.012 g/mL', status: 'Aprobado' as const }]
  const rows = [...batches, ...demo].filter((b) => `${b.id} ${b.product}`.toLowerCase().includes(search.toLowerCase()))
  return <div className="space-y-6"><ModuleHeader eyebrow="Trazabilidad documental" title="Historial de lotes" description="Consulta cronológica de capturas, resultados y estados de calidad. La información mostrada aquí es una simulación para presentación." icon={PackageCheck} tone="slate" /><div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Registros del mes" value="248" helper="+12.4% vs. anterior" /><MetricCard label="Aprobados" value="239" helper="96.4% del total" /><MetricCard label="Pendientes" value="6" helper="en revisión" tone="amber" /></div><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h3 className="font-bold text-slate-950">Registro de análisis</h3><p className="mt-1 text-sm text-slate-500">Ordenado del más reciente al más antiguo.</p></div><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por lote o producto" className="h-9 w-56 rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-500" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3">Lote</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Resultado</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((batch) => <tr key={`history-${batch.id}`} className="hover:bg-slate-50"><td className="px-5 py-4 font-mono text-sm font-bold text-slate-900">{batch.id}</td><td className="px-4 py-4 text-sm text-slate-700">{batch.product}</td><td className="px-4 py-4 text-xs text-slate-500">{batch.date}</td><td className="px-4 py-4 text-xs font-semibold text-slate-600">{batch.value}</td><td className="px-4 py-4"><StatusPill status={batch.status} /></td></tr>)}</tbody></table></div></section></div>
}

function QualityForm({ onSubmit }: { onSubmit: (batch: Batch) => void }) {
  const [id, setId] = useState('L-240813-02')
  const [product, setProduct] = useState('Detergente líquido 3L')
  const [ph, setPh] = useState('8.4')
  const [density, setDensity] = useState('1.028')
  const [notes, setNotes] = useState('')
  const result = useMemo(() => {
    const validPh = Number(ph) >= 6.5 && Number(ph) <= 10
    const validDensity = Number(density) >= 0.98 && Number(density) <= 1.04
    return validPh && validDensity
  }, [ph, density])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Nueva captura</p><h2 className="mt-1 text-lg font-bold text-slate-950">Resultado de análisis</h2></div>
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700"><FlaskConical className="size-5" /></div>
      </div>
      <div className="space-y-5 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="batch-id" className="mb-2 block text-sm font-semibold text-slate-700">ID de lote</label><div className="relative"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><input id="batch-id" value={id} onChange={(e) => setId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-medium outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></div></div><div><label htmlFor="product" className="mb-2 block text-sm font-semibold text-slate-700">Producto</label><select id="product" value={product} onChange={(e) => setProduct(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"><option>Detergente líquido 3L</option><option>Suavizante floral 1L</option><option>Detergente polvo 500g</option></select></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="ph" className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">pH <span className="font-normal text-slate-400">Rango: 6.5 – 10.0</span></label><input id="ph" type="number" step="0.1" value={ph} onChange={(e) => setPh(e.target.value)} className={`h-10 w-full rounded-lg border bg-slate-50 px-3 text-sm font-medium outline-none focus:ring-2 ${Number(ph) >= 6.5 && Number(ph) <= 10 ? 'border-slate-200 focus:border-teal-500 focus:ring-teal-100' : 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-100'}`} /></div>
          <div><label htmlFor="density" className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">Densidad <span className="font-normal text-slate-400">0.98 – 1.04 g/mL</span></label><input id="density" type="number" step="0.001" value={density} onChange={(e) => setDensity(e.target.value)} className={`h-10 w-full rounded-lg border bg-slate-50 px-3 text-sm font-medium outline-none focus:ring-2 ${Number(density) >= 0.98 && Number(density) <= 1.04 ? 'border-slate-200 focus:border-teal-500 focus:ring-teal-100' : 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-100'}`} /></div>
        </div>
        <div><label htmlFor="notes" className="mb-2 block text-sm font-semibold text-slate-700">Observaciones <span className="font-normal text-slate-400">(opcional)</span></label><textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Describe la muestra, equipo o cualquier hallazgo..." className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></div>
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${result ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}><div className={`rounded-full p-1.5 ${result ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{result ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}</div><div><p className={`text-sm font-bold ${result ? 'text-emerald-800' : 'text-red-800'}`}>{result ? 'Lote aprobado' : 'Producto No Conforme (PNC)'}</p><p className="text-xs text-slate-600">{result ? 'Todos los parámetros están dentro de rango.' : 'El lote será bloqueado automáticamente.'}</p></div></div>
        <button type="button" onClick={() => onSubmit({ id, product, notes, date: 'Ahora · captura manual', deviation: result ? '—' : 'Parámetro fuera de rango', value: `pH ${ph} · ${density} g/mL`, status: result ? 'Aprobado' : 'Bloqueado' })} className="h-11 w-full rounded-lg bg-slate-950 text-sm font-bold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">Guardar resultado</button>
      </div>
    </section>
  )
}

export default function QualityDashboard() {
  const [batches, setBatches] = useState(initialBatches)
  const [activeNav, setActiveNav] = useState('Resumen')
  const [alertOpen, setAlertOpen] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [showOnlyPnc, setShowOnlyPnc] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Lote bloqueado automáticamente', detail: 'L-240812-07 presenta pH fuera de rango.', time: 'Hace 8 min', tone: 'red', read: false },
    { id: 2, title: 'Revisión pendiente', detail: 'La muestra L-240810-11 requiere dictamen.', time: 'Hace 24 min', tone: 'amber', read: false },
    { id: 3, title: 'Turno sincronizado', detail: 'Los resultados del turno A fueron actualizados.', time: 'Hace 1 h', tone: 'teal', read: true },
  ])

  const visibleBatches = batches.filter((batch) => {
    const matchesSearch = `${batch.id} ${batch.product}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (!showOnlyPnc || batch.status === 'Bloqueado')
  })

  useEffect(() => {
    fetch('/api/batches').then((response) => response.ok ? response.json() : []).then((rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return
      setBatches(rows.map((row: { batchId: string; product: string; createdAt: string; ph: string; density: string; status: string }) => ({
        id: row.batchId,
        product: row.product,
        date: new Date(row.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        deviation: row.status === 'pnc' ? 'Parámetro fuera de rango' : '—',
        value: `pH ${row.ph} · ${row.density} g/mL`,
        status: row.status === 'pnc' ? 'Bloqueado' : 'Aprobado',
      })))
    }).catch(() => undefined)
  }, [])

  const handleSubmit = async (batch: Batch) => {
    setSaving(true)
    const response = await fetch('/api/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: batch.id, product: batch.product, ph: batch.value.split(' · ')[0].replace('pH ', ''), density: batch.value.split(' · ')[1]?.replace(' g/mL', ''), notes: batch.notes }) })
    const data = await response.json()
    setSaving(false)
    if (!response.ok) { window.alert(data.error ?? 'No fue posible guardar el lote.'); return }
    setBatches((current) => [{ ...batch, status: data.status === 'pnc' ? 'Bloqueado' : 'Aprobado' }, ...current])
  }

  return (
    <div className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6"><div className="flex size-9 items-center justify-center rounded-xl bg-teal-700 text-white"><FlaskConical className="size-5" /></div><div><p className="font-bold tracking-tight text-slate-950">AQUA<span className="text-teal-700">LAB</span></p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Control de calidad</p></div></div>
        <nav className="space-y-1 px-3 py-6">{navItems.map(({ label, icon: Icon, active, count }) => <button key={label} onClick={() => { setActiveNav(label); setMenuOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${activeNav === label || active ? 'bg-teal-50 text-teal-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><span className="flex items-center gap-3"><Icon className="size-[18px]" />{label}</span>{count && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{count}</span>}</button>)}</nav>
        <div className="absolute bottom-0 w-full border-t border-slate-100 p-4"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-700">Planta Norte · Turno A</p><p className="mt-1 text-[11px] text-slate-400">Sincronizado hace 2 min</p><div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />Sistema operativo</div></div></div>
      </aside>
      {menuOpen && <button aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-20 bg-slate-950/20 lg:hidden" />}
      <div className="lg:pl-64">
        <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8"><div className="flex items-center gap-3"><button aria-label="Abrir menú" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"><Menu className="size-5" /></button><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Miércoles, 14 de agosto de 2024</p><h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950">Resumen de calidad</h1></div></div><div className="flex items-center gap-4"><div className="relative"><button onClick={() => setNotificationsOpen((open) => !open)} aria-label="Ver notificaciones" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Bell className="size-5" />{notifications.some((notification) => !notification.read) && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring-2 ring-white" />}</button>{notificationsOpen && <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-sm font-bold text-slate-950">Notificaciones</p><p className="text-[11px] text-slate-400">Alertas del turno · datos demo</p></div><button onClick={() => setNotifications([])} className="text-[11px] font-semibold text-teal-700 hover:text-teal-900">Limpiar</button></div><div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">{notifications.length ? notifications.map((notification) => <button key={notification.id} onClick={() => setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item))} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 ${notification.read ? 'opacity-60' : ''}`}><span className={`mt-1 size-2 shrink-0 rounded-full ${notification.tone === 'red' ? 'bg-red-500' : notification.tone === 'amber' ? 'bg-amber-500' : 'bg-teal-500'}`} /><span><p className="text-xs font-bold text-slate-800">{notification.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{notification.detail}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{notification.time}</p></span></button>) : <p className="px-4 py-8 text-center text-xs text-slate-400">No hay notificaciones pendientes.</p>}</div></div>}</div><div className="hidden h-8 w-px bg-slate-200 sm:block" /><div className="flex items-center gap-2"><div className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">MR</div><div className="hidden text-left sm:block"><p className="text-xs font-bold text-slate-800">María Rodríguez</p><p className="text-[11px] text-slate-400">Supervisora de calidad</p></div><ChevronDown className="hidden size-4 text-slate-400 sm:block" /></div></div></header>
        <main className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-8">

          {activeNav === 'Captura de resultados' && <div className="space-y-6"><ModuleHeader eyebrow="Registro de laboratorio" title="Captura de resultados" description="Ingresa los parámetros del lote para validar automáticamente su liberación o bloqueo como PNC. Esta es la única vista conectada al guardado real." icon={ClipboardCheck} /><QualityForm onSubmit={handleSubmit} /></div>}
          {activeNav === 'Cuarentena / PNC' && <PncDashboard batches={batches} visibleBatches={visibleBatches} search={search} setSearch={setSearch} showOnlyPnc={showOnlyPnc} setShowOnlyPnc={setShowOnlyPnc} setActiveNav={setActiveNav} />}
          {activeNav === 'Historial de lotes' && <HistoryDashboard batches={batches} search={search} setSearch={setSearch} />}
          {activeNav === 'Resumen' && <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[['Lotes analizados', '248', '+12.4%', 'vs. mes anterior', ClipboardCheck, 'up'], ['Tasa de aprobación', '96.4%', '+2.1%', 'vs. mes anterior', CheckCircle2, 'up'], ['Tasa de fallas', '3.6%', '-1.8%', 'vs. mes anterior', ShieldAlert, 'down'], ['En cuarentena', '3', '2 críticos', 'requieren atención', LockKeyhole, 'alert']].map(([label, value, change, caption, Icon, type]) => <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><p className="text-sm font-semibold text-slate-500">{label as string}</p><Icon className={`size-5 ${type === 'alert' ? 'text-red-500' : 'text-teal-600'}`} /></div><p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value as string}</p><div className="mt-2 flex items-center gap-2 text-xs"><span className={`flex items-center gap-0.5 font-bold ${type === 'alert' ? 'text-red-600' : 'text-emerald-600'}`}>{type === 'down' ? <ArrowDownRight className="size-3.5" /> : type === 'alert' ? <AlertTriangle className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}{change as string}</span><span className="text-slate-400">{caption as string}</span></div></div>)}
          </div>
          {(activeNav === 'Resumen' || activeNav === 'Captura de resultados') && <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <QualityForm onSubmit={handleSubmit} />
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Tendencia mensual</p><h2 className="mt-1 text-lg font-bold text-slate-950">Tasa de fallas analíticas</h2></div><button className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500">Últimos 6 meses <ChevronDown className="size-3.5" /></button></div><div className="mt-8 flex h-40 items-end gap-3 border-b border-l border-slate-200 px-3 pb-0 pt-4 sm:gap-6">{[4.9, 4.4, 4.7, 3.8, 4.1, 3.6].map((height, index) => <div key={height + index} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="relative w-full max-w-10 rounded-t-md bg-teal-600 transition hover:bg-teal-500" style={{ height: `${height * 23}%` }}><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-500">{height}%</span></div><span className="text-[10px] font-semibold text-slate-400">{['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago'][index]}</span></div>)}</div><div className="mt-5 flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-slate-500"><span className="size-2 rounded-full bg-teal-600" />Fallas registradas</span><span className="font-semibold text-emerald-600">Mejora continua</span></div></section>
          </div>}
          {activeNav !== 'Captura de resultados' && alertOpen && <section className="rounded-2xl border border-red-200 bg-red-50/70 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-lg bg-red-100 p-2 text-red-600"><AlertTriangle className="size-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-red-900">Alertas requieren atención</h2><span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">2 críticas</span></div><p className="mt-1 text-sm text-red-800/75">Hay lotes bloqueados que requieren disposición del supervisor antes de las 14:00.</p></div></div><button onClick={() => setAlertOpen(false)} className="self-end text-xs font-bold text-red-700 underline underline-offset-2 sm:self-auto">Marcar como revisadas</button></div></section>}
          {(activeNav === 'Resumen' || activeNav === 'Cuarentena / PNC') && <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><LockKeyhole className="size-5 text-red-500" /><h2 className="text-lg font-bold text-slate-950">Cuarentena / PNC</h2><span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{batches.filter((batch) => batch.status === 'Bloqueado').length}</span></div><p className="mt-1 text-sm text-slate-500">Lotes aislados. El envío al CEDI está bloqueado.</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-2.5 top-2.5 size-3.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar lote..." className="h-8 w-36 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs outline-none focus:border-teal-500" /></div><button onClick={() => setShowOnlyPnc((value) => !value)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${showOnlyPnc ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><SlidersHorizontal className="size-4" /> {showOnlyPnc ? 'Solo PNC' : 'Filtrar PNC'}</button><button onClick={() => setActiveNav('Historial de lotes')} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700">Ver historial</button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-400"><tr><th className="px-6 py-3 font-bold">ID de lote</th><th className="px-4 py-3 font-bold">Producto</th><th className="px-4 py-3 font-bold">Fecha de bloqueo</th><th className="px-4 py-3 font-bold">Desviación</th><th className="px-4 py-3 font-bold">Estado</th><th className="px-6 py-3 text-right font-bold">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleBatches.filter((batch) => batch.status !== 'Aprobado').map((batch) => <tr key={`${batch.id}-${batch.date}`} className="text-sm"><td className="px-6 py-4 font-bold text-slate-900">{batch.id}</td><td className="px-4 py-4 text-slate-600">{batch.product}</td><td className="px-4 py-4 text-slate-500">{batch.date}</td><td className="px-4 py-4"><p className="font-semibold text-slate-700">{batch.deviation}</p><p className="text-xs text-red-600">{batch.value}</p></td><td className="px-4 py-4"><StatusPill status={batch.status} /></td><td className="px-6 py-4 text-right"><button className="font-semibold text-teal-700 hover:text-teal-900">Ver detalle</button></td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-100 px-6 py-4"><p className="text-xs text-slate-400">Mostrando {batches.length} lotes en cuarentena</p><div className="flex items-center gap-3 text-xs font-bold text-slate-500"><span className="flex items-center gap-1.5"><Truck className="size-3.5 text-slate-400" /> Envío CEDI bloqueado</span></div></div>          </section>}
          {activeNav === 'Historial de lotes' && <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-6 py-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Consulta operativa</p><h2 className="mt-1 text-lg font-bold text-slate-950">Historial completo de lotes</h2><p className="mt-1 text-sm text-slate-500">Registros demostrativos de análisis recientes y su trazabilidad.</p></div><div className="divide-y divide-slate-100">{visibleBatches.concat([{ id: 'L-240809-04', product: 'Detergente líquido 3L', date: '09 ago, 2024 · 14:05', deviation: '—', value: 'pH 8.1 · 1.026 g/mL', status: 'Aprobado' as const }]).map((batch) => <div key={`history-${batch.id}`} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-sm font-bold text-slate-900">{batch.id}</p><p className="mt-1 text-xs text-slate-500">{batch.product} · {batch.date}</p></div><div className="flex items-center gap-4"><span className="text-xs font-semibold text-slate-500">{batch.value}</span><StatusPill status={batch.status} /></div></div>)}</div></section>}
          </>}
        </main>
      </div>
    </div>
  )
}

export { StatusPill }
