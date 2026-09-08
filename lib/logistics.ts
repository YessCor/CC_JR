import type { Material, InventoryMovement } from '@/lib/db/schema'
import { reorderSuggestion, riskLevel, daysOfCoverage, projectedDailyUse, aggregateDailyUse } from '@/lib/forecast'
import type { MovementLike, RiskLevel } from '@/lib/forecast'

export const MATERIAL_CATEGORIES = [
  'tensioactivo',
  'builder',
  'fragancia',
  'colorante',
  'conservante',
  'envase',
  'etiqueta',
  'otro',
] as const

export const MATERIAL_UNITS = ['kg', 'L', 'unidad'] as const

export const MOVEMENT_TYPES = ['entrada', 'salida', 'ajuste'] as const

export const PO_STATUSES = ['sugerida', 'aprobada', 'en_transito', 'recibida', 'cancelada'] as const
export const PO_OPEN_STATUSES = ['sugerida', 'aprobada', 'en_transito'] as const

export const SHIPMENT_STATUSES = ['preparacion', 'en_transito', 'entregado', 'bloqueado'] as const

/** Convierte un número a string con la escala fija que espera una columna `numeric`. */
export function numStr(n: number, scale = 2): string {
  return (Number.isFinite(n) ? n : 0).toFixed(scale)
}

/** Genera el siguiente código secuencial: PREFIJO-AAAA-NNN. */
export function nextSequentialCode(prefix: string, existingCodes: string[], year = new Date().getFullYear()): string {
  const rx = new RegExp(`^${prefix}-${year}-(\\d+)$`)
  let max = 0
  for (const code of existingCodes) {
    const m = code.match(rx)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`
}

export type EnrichedMaterial = Material & {
  stockNum: number
  unitCostNum: number
  inventoryValue: number
  dailyUse: number
  trendPerDay: number
  coverageDays: number | 'Infinity'
  dynamicRop: number
  effectiveRop: number
  stockoutDate: string | null
  risk: RiskLevel
  shouldOrder: boolean
  suggestedQty: number
  rationale: string
}

/**
 * Enriquece un material con las métricas del motor predictivo a partir de su
 * historial de movimientos. Reutilizado por el endpoint de materiales y por el
 * de overview.
 */
export function enrichMaterial(material: Material, movements: MovementLike[]): EnrichedMaterial {
  const suggestion = reorderSuggestion(
    {
      name: material.name,
      unit: material.unit,
      stock: material.stock,
      safetyStock: material.safetyStock,
      reorderPoint: material.reorderPoint,
      leadTimeDays: material.leadTimeDays,
    },
    movements,
  )
  const stockNum = Number(material.stock) || 0
  const unitCostNum = Number(material.unitCost) || 0

  return {
    ...material,
    stockNum,
    unitCostNum,
    inventoryValue: Math.round(stockNum * unitCostNum * 100) / 100,
    dailyUse: suggestion.dailyUse,
    trendPerDay: suggestion.trendPerDay,
    coverageDays: suggestion.coverageDays === Infinity ? 'Infinity' : suggestion.coverageDays,
    dynamicRop: suggestion.dynamicRop,
    effectiveRop: suggestion.effectiveRop,
    stockoutDate: suggestion.stockoutDate,
    risk: suggestion.risk,
    shouldOrder: suggestion.shouldOrder,
    suggestedQty: suggestion.quantity,
    rationale: suggestion.rationale,
  }
}

/** Agrupa los movimientos por materialId para no recorrer el array N veces. */
export function groupMovements(movements: InventoryMovement[]): Map<number, InventoryMovement[]> {
  const map = new Map<number, InventoryMovement[]>()
  for (const m of movements) {
    const list = map.get(m.materialId)
    if (list) list.push(m)
    else map.set(m.materialId, [m])
  }
  return map
}

/** Serie de consumo total diario (todas las materias) para el gráfico del resumen. */
export function totalConsumptionSeries(movements: InventoryMovement[], days = 30): { day: string; qty: number }[] {
  return aggregateDailyUse(movements as unknown as MovementLike[], days)
}

export { reorderSuggestion, riskLevel, daysOfCoverage, projectedDailyUse }
