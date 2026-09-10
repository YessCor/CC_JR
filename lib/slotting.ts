/**
 * Motor de slotting para el Centro de Distribución (CEDI).
 *
 * Sugiere posiciones de almacenamiento deterministas (misma mercancía => misma
 * posición) con alta rotación cerca de las zonas de despacho/producción y
 * políticas FIFO / FEFO. Cubre:
 *  - Producto terminado (PT) en los pasillos A–C, junto a la salida de despachos.
 *  - Materias primas e insumos (MP) en los pasillos D–F, cerca del área de producción.
 *  - Entradas con vencimiento próximo activan FEFO (nivel 1, prioridad de salida).
 */

export type SlottingSuggestion = {
  aisle: string // Pasillo: A | B | C (PT) o D | E | F (MP)
  rack: string // Estante 01..06 (con padding)
  level: number // Nivel 1..3
  cell: string // Código corto de la ubicación, ej. "A-03 / Nivel 2"
  zone: string // Zona de almacenamiento
  criterion: string // Política aplicada (FIFO / FEFO)
  distanceToDispatch: number // metros al muelle / zona relevante
}

export const SLOTTING_AISLES = ['A', 'B', 'C'] as const
export const SLOTTING_MP_AISLES = ['D', 'E', 'F'] as const // Materias primas / insumos
export const SLOTTING_ZONE = 'Zona de Alta Rotación'
export const SLOTTING_MP_ZONE = 'Zona de Insumos (Alta Rotación)'
export const SLOTTING_CRITERION = 'Política FIFO · Cercano a salida de despachos'
export const SLOTTING_CRITERION_FEFO = 'Política FEFO · Vencimiento próximo · Salida prioritaria'
export const SLOTTING_MP_CRITERION = 'Política FIFO · Cercano al área de producción'
export const SLOTTING_RACKS = 6 // estantes visibles en la retícula por pasillo
export const SLOTTING_LEVELS = 3 // niveles visibles en la retícula

const FEFO_WINDOW_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

export type GoodsKind = 'MP' | 'PT'

export type SlottingInput = {
  /** Nombre o key del producto: "Detergente Gliss", insumo, etc. */
  product: string
  /** MP = materia prima / insumo; PT = producto terminado. */
  kind: GoodsKind
  /** Vencimiento del lote/ingrediente; activa FIFO→FEFO si está próximo. */
  expiresAt?: string | Date | null
}

/** Hash 32-bit determinista (FNV-1a) para repartir la mercancía entre pasillos. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Índice a posición de estante con padding: 0 -> "01". */
export function rackCode(rack: number): string {
  return String(Math.max(1, Math.min(SLOTTING_RACKS, rack))).padStart(2, '0')
}

function buildSuggestion(
  aisle: string,
  rack: number,
  level: number,
  zone: string,
  criterion: string,
  distance: number,
): SlottingSuggestion {
  const cell = `${aisle}-${rackCode(rack)} / Nivel ${level}`
  return { aisle, rack: rackCode(rack), level, cell, zone, criterion, distanceToDispatch: distance }
}

/** Días hasta el vencimiento; null si no hay vencimiento o ya venció. */
function daysToExpiry(expiresAt?: string | Date | null): number | null {
  if (!expiresAt) return null
  const ts = new Date(expiresAt).getTime()
  if (Number.isNaN(ts)) return null
  return (ts - Date.now()) / DAY_MS
}

/**
 * Ubicación sugerida al registrar una entrada de mercancía.
 *
 * - Proyecta el pasillo a partir del producto: A–C para PT, D–F para MP.
 * - Si el vencimiento está a menos de 60 días aplica FEFO y lo manda al nivel 1
 *   (salida prioritaria); si no, política FIFO con nivel 1 o 2 (alta rotación).
 */
export function suggestSlottingEntry({ product, kind, expiresAt }: SlottingInput): SlottingSuggestion {
  const aisles = kind === 'PT' ? SLOTTING_AISLES : SLOTTING_MP_AISLES
  const hash = fnv1a(`${kind}::${String(product ?? '').trim().toUpperCase()}`)
  const aisle = aisles[hash % aisles.length]
  const rack = 1 + ((hash >>> 3) % SLOTTING_RACKS)

  const remaining = daysToExpiry(expiresAt)
  const fefo = remaining != null && remaining < FEFO_WINDOW_DAYS
  const level = fefo ? 1 : 1 + ((hash >>> 5) % 2)

  const zone = kind === 'PT' ? SLOTTING_ZONE : SLOTTING_MP_ZONE
  const criterion = kind === 'PT' ? (fefo ? SLOTTING_CRITERION_FEFO : SLOTTING_CRITERION) : SLOTTING_MP_CRITERION
  const distance = kind === 'PT' ? 15 + ((hash >>> 8) % 20) : 8 + ((hash >>> 8) % 15)

  return buildSuggestion(aisle, rack, level, zone, criterion, distance)
}

/**
 * Posición sugerida para un lote de producto terminado. Los lotes de ejemplo
 * del módulo quedan anclados a "Pasillo A | Estante 02 | Nivel 1" para que la
 * demo sea reproducible; el resto se reparte de forma determinista.
 */
export function suggestSlotting(batchId: string, product?: string): SlottingSuggestion {
  if (batchId === 'LOTE-GLISS-2026-01' || batchId === 'LOTE-LITO-2026-02') {
    return buildSuggestion('A', 2, 1, SLOTTING_ZONE, SLOTTING_CRITERION, 18)
  }

  return suggestSlottingEntry({ product: batchId, kind: 'PT' })
}