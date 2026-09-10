/**
 * Motor predictivo de inventarios (on-device, sin servicios externos).
 *
 * A partir del historial de consumo (movimientos de tipo "salida") estima el uso
 * diario proyectado combinando una media móvil con decaimiento exponencial y la
 * tendencia obtenida por regresión lineal de mínimos cuadrados. A eso le aplica un
 * factor de demanda estacional (campaña de detergentes "Gliss"/"Lito", +20–30%
 * por categoría de insumo). Con eso calcula días de cobertura, fecha estimada de
 * quiebre, punto de reorden dinámico y la cantidad sugerida a ordenar.
 *
 * Todas las funciones son puras. Los valores `numeric` de la base de datos llegan
 * como string, así que cualquier entrada se normaliza con `Number(...)`.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Factor de demanda estacional: aumento proyectado del consumo por el
 * lanzamiento / campaña de los detergentes insignia "Gliss" y "Lito".
 * Los insumos de empaque y aromas (los más ligados a la producción de
 * producto terminado) reciben el mayor impulso (20–30%).
 */
export const SEASONAL_LIFT: Record<string, number> = {
  tensioactivo: 0.25,
  builder: 0.2,
  fragancia: 0.3,
  colorante: 0.2,
  conservante: 0.1,
  envase: 0.3,
  etiqueta: 0.3,
  otro: 0.15,
}

export const SEASONAL_CAMPAIGN = 'Gliss / Lito'

/** Impulso porcentual (0..1) que aplica a un insumo según su categoría. */
export function seasonalDemandFactor(category: string | null | undefined): number {
  return SEASONAL_LIFT[category ?? 'otro'] ?? SEASONAL_LIFT.otro
}

export type MovementLike = {
  type: string
  quantity: number | string
  createdAt: string | Date
}

export type DailyUsePoint = { day: string; qty: number }

export type Trend = { slope: number; intercept: number }

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

/** Suma el consumo ("salida") por día calendario dentro de la ventana indicada. */
export function aggregateDailyUse(movements: MovementLike[], sinceDays = 45): DailyUsePoint[] {
  const from = Date.now() - sinceDays * DAY_MS
  const totals = new Map<string, number>()

  // Prellenar cada día de la ventana con 0 para no sesgar la media.
  for (let i = sinceDays - 1; i >= 0; i--) {
    totals.set(isoDay(new Date(Date.now() - i * DAY_MS)), 0)
  }

  for (const m of movements) {
    if (m.type !== 'salida') continue
    const ts = new Date(m.createdAt).getTime()
    if (Number.isNaN(ts) || ts < from) continue
    const key = isoDay(new Date(ts))
    if (!totals.has(key)) continue
    totals.set(key, (totals.get(key) ?? 0) + num(m.quantity))
  }

  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, qty]) => ({ day, qty }))
}

/** Media del consumo diario con más peso en los días recientes. */
export function weightedAvgDailyUse(series: DailyUsePoint[], halfLifeDays = 14): number {
  if (series.length === 0) return 0
  const lambda = Math.LN2 / halfLifeDays
  const n = series.length
  let weightedSum = 0
  let weightTotal = 0
  series.forEach((point, i) => {
    const ageDays = n - 1 - i
    const w = Math.exp(-lambda * ageDays)
    weightedSum += w * point.qty
    weightTotal += w
  })
  return weightTotal > 0 ? weightedSum / weightTotal : 0
}

/** Regresión lineal de mínimos cuadrados sobre (índice de día, consumo). */
export function linearTrend(series: DailyUsePoint[]): Trend {
  const n = series.length
  if (n < 2) return { slope: 0, intercept: series[0]?.qty ?? 0 }
  let sx = 0
  let sy = 0
  let sxy = 0
  let sxx = 0
  series.forEach((point, i) => {
    sx += i
    sy += point.qty
    sxy += i * point.qty
    sxx += i * i
  })
  const denom = n * sxx - sx * sx
  if (denom === 0) return { slope: 0, intercept: sy / n }
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { slope, intercept }
}

/**
 * Uso diario proyectado para el horizonte del lead time: media ponderada más la
 * mitad de la tendencia acumulada sobre ese horizonte, con piso en 0.
 */
export function projectedDailyUse(series: DailyUsePoint[], leadTimeDays = 7): number {
  const base = weightedAvgDailyUse(series)
  const { slope } = linearTrend(series)
  const projected = base + (slope * leadTimeDays) / 2
  return Math.max(0, projected)
}

export function daysOfCoverage(stock: number | string, dailyUse: number): number {
  const s = num(stock)
  if (dailyUse <= 0) return Infinity
  return s / dailyUse
}

export function dynamicReorderPoint(dailyUse: number, leadTimeDays: number, safetyStock: number | string): number {
  return dailyUse * Math.max(0, leadTimeDays) + num(safetyStock)
}

export function stockoutDate(stock: number | string, dailyUse: number, from: Date = new Date()): Date | null {
  const cov = daysOfCoverage(stock, dailyUse)
  if (!Number.isFinite(cov)) return null
  return new Date(from.getTime() + cov * DAY_MS)
}

export type RiskLevel = 'critico' | 'alto' | 'medio' | 'ok'

export function riskLevel(coverageDays: number, leadTimeDays: number): RiskLevel {
  if (!Number.isFinite(coverageDays)) return 'ok'
  const lead = Math.max(1, leadTimeDays)
  if (coverageDays <= lead) return 'critico'
  if (coverageDays <= lead * 1.5) return 'alto'
  if (coverageDays <= lead * 2.5) return 'medio'
  return 'ok'
}

export type MaterialForForecast = {
  name: string
  unit: string
  category?: string | null
  stock: number | string
  safetyStock: number | string
  reorderPoint: number | string | null
  leadTimeDays: number
}

export type ReorderSuggestion = {
  shouldOrder: boolean
  quantity: number
  dailyUse: number
  trendPerDay: number
  coverageDays: number
  dynamicRop: number
  effectiveRop: number
  stockoutDate: string | null
  risk: RiskLevel
  seasonalFactor: number
  rationale: string
}

const REVIEW_PERIOD_DAYS = 14

const fmtDate = (d: Date | null): string | null =>
  d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : null

/** Recomendación completa de reabastecimiento para un material. */
export function reorderSuggestion(material: MaterialForForecast, movements: MovementLike[]): ReorderSuggestion {
  const series = aggregateDailyUse(movements)
  const baseDailyUse = projectedDailyUse(series, material.leadTimeDays)
  const seasonalFactor = seasonalDemandFactor(material.category)
  const dailyUse = baseDailyUse * (1 + seasonalFactor)
  const { slope } = linearTrend(series)
  const stock = num(material.stock)
  const coverageDays = daysOfCoverage(stock, dailyUse)
  const dynamicRop = dynamicReorderPoint(dailyUse, material.leadTimeDays, material.safetyStock)
  const manualRop = material.reorderPoint == null ? null : num(material.reorderPoint)
  const effectiveRop = manualRop ?? dynamicRop
  const breakDate = stockoutDate(stock, dailyUse)
  const risk = riskLevel(coverageDays, material.leadTimeDays)

  const shouldOrder = stock <= effectiveRop || coverageDays <= material.leadTimeDays * 1.3
  const target = effectiveRop + dailyUse * REVIEW_PERIOD_DAYS
  const quantity = shouldOrder ? Math.max(0, Math.ceil(target - stock)) : 0

  let rationale: string
  if (!shouldOrder) {
    rationale = `Cobertura de ${fmtCoverage(coverageDays)}; por encima del punto de reorden (${round(effectiveRop)} ${material.unit}).`
  } else {
    const trendNote =
      slope > 0.05 ? ' El consumo viene en aumento.' : slope < -0.05 ? ' El consumo viene a la baja.' : ''
    const seasonalNote =
      seasonalFactor > 0.01
        ? ` Factor estacional por campaña ${SEASONAL_CAMPAIGN}: +${Math.round(seasonalFactor * 100)}% de demanda proyectada.`
        : ''
    const when = breakDate ? ` Quiebre estimado el ${fmtDate(breakDate)}.` : ''
    rationale =
      `Uso proyectado ${round(dailyUse)} ${material.unit}/día (estacional) y lead time de ${material.leadTimeDays} días. ` +
      `Stock ${round(stock)} ≤ reorden ${round(effectiveRop)} ${material.unit}.${when}${trendNote}${seasonalNote} ` +
      `Se sugiere ordenar ${quantity} ${material.unit} para cubrir ${REVIEW_PERIOD_DAYS} días tras la reposición.`
  }

  return {
    shouldOrder,
    quantity,
    dailyUse: round(dailyUse),
    trendPerDay: round(slope, 3),
    coverageDays: Number.isFinite(coverageDays) ? round(coverageDays, 1) : Infinity,
    dynamicRop: round(dynamicRop),
    effectiveRop: round(effectiveRop),
    stockoutDate: breakDate ? breakDate.toISOString() : null,
    risk,
    seasonalFactor: round(seasonalFactor, 3),
    rationale,
  }
}

function round(n: number, decimals = 2): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

function fmtCoverage(days: number): string {
  if (!Number.isFinite(days)) return 'sin consumo reciente'
  if (days < 1) return 'menos de 1 día'
  return `${Math.round(days)} días`
}

export const RISK_ORDER: Record<RiskLevel, number> = { critico: 0, alto: 1, medio: 2, ok: 3 }
