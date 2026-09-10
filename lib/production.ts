import type { Material } from '@/lib/db/schema'

export const DAY_MS = 24 * 60 * 60 * 1000

export type ShiftDef = {
  id: string
  label: string
  start: string
  end: string
}

export const SHIFTS: ShiftDef[] = [
  { id: 'T1', label: 'Mañana', start: '06:00', end: '14:00' },
  { id: 'T2', label: 'Tarde', start: '14:00', end: '22:00' },
  { id: 'T3', label: 'Noche', start: '22:00', end: '06:00' },
]

export const LINES: { id: string; label: string }[] = [
  { id: 'A', label: 'Línea de líquidos' },
  { id: 'B', label: 'Línea de polvos' },
]

export const ORDER_STATUSES = ['programado', 'en_proceso', 'completado', 'retrasado_insumos', 'cancelado'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  programado: 'Programado',
  en_proceso: 'En proceso',
  completado: 'Completado',
  retrasado_insumos: 'Pendiente de insumos',
  cancelado: 'Cancelado',
}

type BomEntry = { sku?: string; category?: string; perUnit: number }

export type ProductDef = {
  name: string
  line: 'A' | 'B'
  driverSku?: string
  baseDailyUnits: number
  capacityPerShift: number
  bom: BomEntry[]
}

export const PRODUCTS: ProductDef[] = [
  {
    name: 'Detergente líquido 3L',
    line: 'A',
    driverSku: 'EN-BOT3L-009',
    baseDailyUnits: 900,
    capacityPerShift: 4800,
    bom: [
      { category: 'tensioactivo', perUnit: 0.026 },
      { category: 'builder', perUnit: 0.009 },
      { category: 'fragancia', perUnit: 0.0005 },
      { category: 'conservante', perUnit: 0.0006 },
      { sku: 'EN-BOT3L-009', perUnit: 1 },
      { category: 'etiqueta', perUnit: 1 },
    ],
  },
  {
    name: 'Suavizante floral 1L',
    line: 'A',
    driverSku: 'EN-BOT1L-010',
    baseDailyUnits: 1200,
    capacityPerShift: 6000,
    bom: [
      { category: 'tensioactivo', perUnit: 0.008 },
      { category: 'fragancia', perUnit: 0.001 },
      { category: 'conservante', perUnit: 0.0004 },
      { sku: 'EN-BOT1L-010', perUnit: 1 },
      { category: 'etiqueta', perUnit: 1 },
    ],
  },
  {
    name: 'Detergente polvo 500g',
    line: 'B',
    baseDailyUnits: 1300,
    capacityPerShift: 4000,
    bom: [
      { category: 'tensioactivo', perUnit: 0.085 },
      { category: 'builder', perUnit: 0.32 },
      { category: 'fragancia', perUnit: 0.0004 },
    ],
  },
]

export type PlannedOrder = {
  product: string
  line: 'A' | 'B'
  shift: string
  scheduledDate: Date
  units: number
  priority: number
  origin: 'autonomo' | 'manual'
  materialAvailable: boolean
  rationale: string
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10)
const nextDay = (d: Date): Date => new Date(d.getTime() + DAY_MS)
const round2 = (n: number): number => Math.round(n * 100) / 100

/** Resuelve una entrada de BOM al material concreto (por SKU o primera de la categoría). */
export function resolveBomMaterial(entry: BomEntry, materials: Material[]): Material | null {
  if (entry.sku) return materials.find((m) => m.sku === entry.sku) ?? null
  return materials.find((m) => m.category === entry.category) ?? null
}

/** Consumo necesario de cada material para fabricar `units` de un producto. */
export function bomForUnits(productName: string, units: number): { sku?: string; category?: string; qty: number }[] {
  const product = PRODUCTS.find((p) => p.name === productName)
  if (!product) return []
  return product.bom
    .map((b) => ({ ...b, qty: round2(b.perUnit * units) }))
    .filter((b) => b.qty > 0)
}

/** Verifica si hay stock suficiente para un lote dado y devuelve los faltantes. */
export function materialShortages(
  productName: string,
  units: number,
  materials: Material[],
): { sku: string; name: string; unit: string; needed: number; stock: number }[] {
  const product = PRODUCTS.find((p) => p.name === productName)
  if (!product) return []
  const shortages: { sku: string; name: string; unit: string; needed: number; stock: number }[] = []
  for (const entry of product.bom) {
    const material = resolveBomMaterial(entry, materials)
    if (!material) continue
    const needed = round2(entry.perUnit * units)
    const stock = Number(material.stock) || 0
    if (needed > stock) shortages.push({ sku: material.sku, name: material.name, unit: material.unit, needed, stock })
  }
  return shortages
}

type WorkingMaterial = { stock: number }

/**
 * Genera de forma autónoma el programa de producción a 7 días: calcula la demanda
 * diaria por producto (uso proyectado del insumo de empaque o base configurada),
 * la reparte en turnos y líneas respetando capacidad y disponibilidad de insumos
 * (MRP simulado con descontado acumulado).
 */
export function planProduction(input: {
  products: ProductDef[]
  materials: Material[]
  driverDailyUse: Map<string, number>
  approvedBacklog: { product: string; units: number }[]
  existingToday: { product: string; units: number }[]
  start: Date
  days?: number
}): PlannedOrder[] {
  const { materials } = input
  const days = Math.max(1, Math.min(14, input.days ?? 7))
  const working = new Map<string, WorkingMaterial>()

  const dailyDemand = (product: ProductDef): number => {
    if (product.driverSku) {
      const use = input.driverDailyUse.get(product.driverSku)
      if (typeof use === 'number' && use > 0) return Math.max(1, Math.round(use * 1.1))
    }
    return product.baseDailyUnits
  }

  const orders: PlannedOrder[] = []
  const producedToday: Record<string, number> = {}
  for (const b of input.existingToday) producedToday[b.product] = (producedToday[b.product] ?? 0) + b.units

  const pendingByProduct = new Map<string, number>()
  for (const b of input.approvedBacklog) pendingByProduct.set(b.product, (pendingByProduct.get(b.product) ?? 0) + b.units)

  const firstDayExcess: Record<string, number> = {}
  for (const b of input.approvedBacklog) {
    firstDayExcess[b.product] = (firstDayExcess[b.product] ?? 0) + b.units
  }

  const mkOrder = (
    product: ProductDef,
    units: number,
    line: 'A' | 'B',
    shift: string,
    date: Date,
    priority: number,
  ): PlannedOrder => {
    const shortages: { name: string; unit: string; needed: number; available: number; diff: number }[] = []
    for (const entry of product.bom) {
      const material = resolveBomMaterial(entry, materials)
      if (!material) continue
      const key = material.id.toString()
      const current = working.get(key)?.stock ?? (Number(material.stock) || 0)
      working.set(key, { stock: Number.isFinite(current) ? current : 0 })
    }
    for (const entry of product.bom) {
      const material = resolveBomMaterial(entry, materials)
      if (!material) continue
      const key = material.id.toString()
      const available = working.get(key)?.stock ?? 0
      const needed = round2(entry.perUnit * units)
      if (needed > available + 1e-9) {
        shortages.push({ name: material.name, unit: material.unit, needed, available, diff: round2(needed - available) })
      }
      working.set(key, { stock: Math.max(0, available - needed) })
    }

    const materialAvailable = shortages.length === 0
    let rationale = `Demanda proyectada: ${units.toLocaleString('es-MX')} unidades (${product.line === 'A' ? 'líquidos' : 'polvos'}).`
    if (materialAvailable) {
      rationale += ' Insumos disponibles; consumo descontado del inventario proyectado.'
    } else {
      rationale += ` Falta: ${shortages.map((s) => `${s.name} (-${s.diff} ${s.unit})`).slice(0, 3).join('; ') || 'insumos sin maestro de BOM'}.`
    }

    return {
      product: product.name,
      line,
      shift,
      scheduledDate: date,
      units,
      priority,
      origin: 'autonomo',
      materialAvailable,
      rationale,
    }
  }

  const remaining: Record<string, number> = {}
  for (const product of input.products) {
    let demand = dailyDemand(product) * days
    const produced = producedToday[product.name] ?? 0
    demand = Math.max(0, demand - produced)
    const firstDay = firstDayExcess[product.name] ?? 0
    remaining[product.name] = Math.round(demand + firstDay)
  }

  let dayCursor = new Date(input.start)
  for (let d = 0; d < days && dayCursor; d++) {
    const leftover: Record<string, number> = {}
    for (const product of input.products) {
      const each = remaining[product.name] ?? 0
      if (each <= 0) continue
      const lineShifts = SHIFTS.length
      const cap = product.capacityPerShift * lineShifts
      const alloc = Math.min(each, cap)
      remaining[product.name] = Math.max(0, each - alloc)

      let toPlace = alloc
      let priority = d === 0 && (firstDayExcess[product.name] ?? 0) > 0 ? 1 : 2
      for (const shift of SHIFTS) {
        if (toPlace <= 0) break
        const chunk = Math.round(Math.min(toPlace, product.capacityPerShift))
        if (chunk <= 0) continue
        orders.push(mkOrder(product, chunk, product.line, shift.id, dayCursor, priority))
        toPlace -= chunk
      }
      if (toPlace > 0) leftover[product.name] = (leftover[product.name] ?? 0) + toPlace
    }
    for (const [name, qty] of Object.entries(leftover)) {
      remaining[name] = (remaining[name] ?? 0) + qty
    }
    dayCursor = nextDay(dayCursor)
  }

  const remainingTotal = Object.entries(remaining).reduce((acc, [, qty]) => acc + Math.max(0, qty), 0)
  if (remainingTotal > 0) {
    let extraCursor = new Date(dayCursor)
    for (const product of input.products) {
      const each = remaining[product.name] ?? 0
      if (each <= 0) continue
      let toPlace = each
      for (let pass = 0; pass < Math.ceil(toPlace / product.capacityPerShift) && toPlace > 0; pass++) {
        for (const shift of SHIFTS) {
          if (toPlace <= 0) break
          const chunk = Math.round(Math.min(toPlace, product.capacityPerShift))
          orders.push(mkOrder(product, chunk, product.line, shift.id, extraCursor, 3))
          toPlace -= chunk
        }
        extraCursor = nextDay(extraCursor)
      }
    }
  }

  return orders.sort((a, b) => {
    const dl = a.scheduledDate.getTime() - b.scheduledDate.getTime()
    if (dl !== 0) return dl
    const sl = a.shift.localeCompare(b.shift)
    if (sl !== 0) return sl
    return a.priority - b.priority
  })
}

export function shiftOrder(shiftId: string): number {
  return SHIFTS.findIndex((s) => s.id === shiftId)
}

/** Instante de inicio del turno (con la hora definida en SHIFTS). */
export function shiftStartTime(date: Date, shiftId: string): Date {
  const def = SHIFTS.find((s) => s.id === shiftId) ?? SHIFTS[0]
  const [h, m] = def.start.split(':').map(Number)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d
}

export type HistoryOrder = PlannedOrder & {
  status: 'completado'
  completedAt: Date
}

/**
 * Genera un histórico determinista de órdenes completadas para los últimos
 * `daysBack` días: cada producto cierra una orden por día rotando el turno,
 * con unidades ligeramente variables para que el rendimiento por turno se vea
 * distinto entre Madrugada, Mañana y Noche.
 */
export function planCompletedHistory(input: { products: ProductDef[]; start: Date; daysBack?: number }): HistoryOrder[] {
  const daysBack = Math.max(3, Math.min(14, input.daysBack ?? 7))
  const rows: HistoryOrder[] = []
  for (let d = daysBack - 1; d >= 0; d--) {
    const date = new Date(input.start.getTime() - (d + 1) * DAY_MS)
    input.products.forEach((product, pi) => {
      const shift = SHIFTS[(d + pi) % SHIFTS.length]
      const units = product.capacityPerShift - ((d + pi) % 3) * 40
      const startAt = shiftStartTime(date, shift.id)
      rows.push({
        product: product.name,
        line: product.line,
        shift: shift.id,
        scheduledDate: startAt,
        completedAt: new Date(startAt.getTime() + 7.5 * 3600 * 1000),
        units,
        priority: 2,
        origin: 'autonomo',
        materialAvailable: true,
        status: 'completado',
        rationale: `Completada en turno ${shift.label} (línea ${product.line === 'A' ? 'de líquidos' : 'de polvos'}).`,
      })
    })
  }
  return rows.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())
}