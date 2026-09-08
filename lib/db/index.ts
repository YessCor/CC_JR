import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from 'pg'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

/**
 * Data layer.
 *
 * - If `DATABASE_URL` is set, connect to a real PostgreSQL server (Neon, Supabase,
 *   Vercel Postgres, etc.) through node-postgres.
 * - Otherwise fall back to PGlite: an in-process PostgreSQL that persists to a local
 *   `.pglite` folder, so the project runs end to end with zero external setup.
 */

type DbClient = ReturnType<typeof createDb>

const globalForDb = globalThis as unknown as {
  db?: DbClient
  ready?: Promise<void>
}

function createDb() {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    return drizzlePg(pool, { schema })
  }
  return drizzlePglite(new PGlite('.pglite'), { schema })
}

function getDb(): DbClient {
  if (!globalForDb.db) globalForDb.db = createDb()
  return globalForDb.db
}

/**
 * Lazy proxy: the underlying driver (and, with PGlite, the WASM instance) is only
 * created on first real use. This keeps `next build`'s static workers — which
 * import this module but never query — from spinning up competing PGlite
 * instances against the same `.pglite` folder.
 */
export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop) {
    const client = getDb() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value
  },
})

/**
 * Ensures the schema exists (and seeds demo data on first run).
 * Idempotent and executed at most once per process.
 */
export function ensureDb(): Promise<void> {
  if (!globalForDb.ready) {
    globalForDb.ready = bootstrap().catch((error) => {
      // Don't cache a failed bootstrap: let the next request try again.
      globalForDb.ready = undefined
      throw error
    })
  }
  return globalForDb.ready
}

async function bootstrap(): Promise<void> {
  await bootstrapQuality()
  await bootstrapLogistics()
}

// ---------------------------------------------------------------------------
// Calidad
// ---------------------------------------------------------------------------

async function bootstrapQuality(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quality_batches (
      id bigserial PRIMARY KEY,
      batch_id text NOT NULL UNIQUE,
      product text NOT NULL,
      ph numeric(5, 2) NOT NULL,
      density numeric(6, 3) NOT NULL,
      status text NOT NULL,
      notes text,
      units integer NOT NULL DEFAULT 1000,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`ALTER TABLE quality_batches ADD COLUMN IF NOT EXISTS units integer NOT NULL DEFAULT 1000`)

  const existing = (await db.execute(
    sql`SELECT count(*)::int AS count FROM quality_batches`,
  )) as unknown as { rows: { count: number }[] }
  if ((existing.rows?.[0]?.count ?? 0) > 0) return

  await db.execute(sql`
    INSERT INTO quality_batches (batch_id, product, ph, density, status, notes, created_at) VALUES
      ('L-240812-07', 'Detergente líquido 3L', 10.80, 1.031, 'pnc', 'pH fuera de rango; envío al CEDI bloqueado.', now() - interval '2 days'),
      ('L-240811-03', 'Suavizante floral 1L', 7.90, 1.042, 'pnc', 'Densidad fuera de rango; envío al CEDI bloqueado.', now() - interval '3 days'),
      ('L-240810-11', 'Detergente polvo 500g', 8.20, 1.010, 'approved', NULL, now() - interval '4 days'),
      ('L-240809-04', 'Detergente líquido 3L', 8.10, 1.026, 'approved', NULL, now() - interval '5 days'),
      ('L-240808-09', 'Suavizante floral 1L', 7.80, 1.012, 'approved', NULL, now() - interval '6 days')
  `)
}

// ---------------------------------------------------------------------------
// Logística e inventarios
// ---------------------------------------------------------------------------

async function bootstrapLogistics(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS materials (
      id bigserial PRIMARY KEY,
      sku text NOT NULL UNIQUE,
      name text NOT NULL,
      category text NOT NULL,
      unit text NOT NULL,
      stock numeric(12, 2) NOT NULL DEFAULT 0,
      safety_stock numeric(12, 2) NOT NULL DEFAULT 0,
      reorder_point numeric(12, 2),
      lead_time_days integer NOT NULL DEFAULT 7,
      unit_cost numeric(12, 2) NOT NULL DEFAULT 0,
      supplier text,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id bigserial PRIMARY KEY,
      material_id integer NOT NULL,
      type text NOT NULL,
      quantity numeric(12, 2) NOT NULL,
      balance_after numeric(12, 2) NOT NULL,
      reason text,
      reference text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id bigserial PRIMARY KEY,
      code text NOT NULL UNIQUE,
      material_id integer NOT NULL,
      quantity numeric(12, 2) NOT NULL,
      unit_cost numeric(12, 2) NOT NULL,
      supplier text,
      status text NOT NULL DEFAULT 'sugerida',
      origin text NOT NULL DEFAULT 'manual',
      rationale text,
      expected_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS shipments (
      id bigserial PRIMARY KEY,
      code text NOT NULL UNIQUE,
      batch_id text NOT NULL,
      product text NOT NULL,
      units integer NOT NULL,
      destination text NOT NULL DEFAULT 'CEDI Central',
      carrier text,
      status text NOT NULL DEFAULT 'preparacion',
      dispatched_at timestamptz,
      delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const existing = (await db.execute(
    sql`SELECT count(*)::int AS count FROM materials`,
  )) as unknown as { rows: { count: number }[] }
  if ((existing.rows?.[0]?.count ?? 0) > 0) return

  await seedLogistics()
}

/** PRNG determinista para que el seed sea reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type MaterialSeed = {
  sku: string
  name: string
  category: string
  unit: string
  baseRate: number // consumo diario típico
  leadTimeDays: number
  unitCost: number
  safetyStock: number
  supplier: string
  trend: number // fracción de cambio del consumo a lo largo de la ventana
  atRisk: boolean
}

const MATERIAL_SEEDS: MaterialSeed[] = [
  { sku: 'MP-LAS-001', name: 'Ácido sulfónico lineal (LAS)', category: 'tensioactivo', unit: 'kg', baseRate: 320, leadTimeDays: 12, unitCost: 3.85, safetyStock: 800, supplier: 'Química Andina S.A.', trend: 0.35, atRisk: false },
  { sku: 'MP-SLES-002', name: 'Lauril éter sulfato de sodio (SLES 70%)', category: 'tensioactivo', unit: 'kg', baseRate: 210, leadTimeDays: 14, unitCost: 4.2, safetyStock: 600, supplier: 'Química Andina S.A.', trend: 0.2, atRisk: true },
  { sku: 'MP-STPP-003', name: 'Tripolifosfato de sodio (STPP)', category: 'builder', unit: 'kg', baseRate: 180, leadTimeDays: 20, unitCost: 1.95, safetyStock: 900, supplier: 'Insumos del Pacífico', trend: 0, atRisk: false },
  { sku: 'MP-CARB-004', name: 'Carbonato de sodio', category: 'builder', unit: 'kg', baseRate: 260, leadTimeDays: 10, unitCost: 0.72, safetyStock: 700, supplier: 'Insumos del Pacífico', trend: 0, atRisk: false },
  { sku: 'MP-FRAG-005', name: 'Fragancia lavanda', category: 'fragancia', unit: 'kg', baseRate: 24, leadTimeDays: 25, unitCost: 18.5, safetyStock: 60, supplier: 'Aromas y Color SAS', trend: 0.15, atRisk: true },
  { sku: 'MP-FRAG-006', name: 'Fragancia floral', category: 'fragancia', unit: 'kg', baseRate: 19, leadTimeDays: 25, unitCost: 17.9, safetyStock: 50, supplier: 'Aromas y Color SAS', trend: 0, atRisk: false },
  { sku: 'MP-COLB-007', name: 'Colorante azul índigo', category: 'colorante', unit: 'kg', baseRate: 6, leadTimeDays: 18, unitCost: 42, safetyStock: 15, supplier: 'Aromas y Color SAS', trend: 0, atRisk: false },
  { sku: 'MP-CONS-008', name: 'Conservante (isotiazolinona)', category: 'conservante', unit: 'kg', baseRate: 9, leadTimeDays: 15, unitCost: 26, safetyStock: 25, supplier: 'Química Andina S.A.', trend: 0, atRisk: false },
  { sku: 'EN-BOT3L-009', name: 'Botella HDPE 3 L', category: 'envase', unit: 'unidad', baseRate: 950, leadTimeDays: 9, unitCost: 0.34, safetyStock: 4000, supplier: 'Envases Nacionales Ltda.', trend: 0.5, atRisk: true },
  { sku: 'EN-BOT1L-010', name: 'Botella HDPE 1 L', category: 'envase', unit: 'unidad', baseRate: 1400, leadTimeDays: 9, unitCost: 0.19, safetyStock: 5000, supplier: 'Envases Nacionales Ltda.', trend: 0.25, atRisk: false },
  { sku: 'EN-TAPA-011', name: 'Tapa rosca 28 mm', category: 'envase', unit: 'unidad', baseRate: 2400, leadTimeDays: 7, unitCost: 0.04, safetyStock: 9000, supplier: 'Envases Nacionales Ltda.', trend: 0, atRisk: false },
  { sku: 'ET-ETIQ-012', name: 'Etiqueta autoadhesiva 3 L', category: 'etiqueta', unit: 'unidad', baseRate: 980, leadTimeDays: 6, unitCost: 0.06, safetyStock: 3500, supplier: 'Gráficas del Valle', trend: 0, atRisk: false },
]

const DAY_MS = 24 * 60 * 60 * 1000
const HISTORY_DAYS = 45

async function seedLogistics(): Promise<void> {
  const rng = mulberry32(20260907)
  const round2 = (n: number) => Math.round(n * 100) / 100

  const inserted = await db
    .insert(schema.materials)
    .values(
      MATERIAL_SEEDS.map((m) => ({
        sku: m.sku,
        name: m.name,
        category: m.category,
        unit: m.unit,
        stock: '0',
        safetyStock: m.safetyStock.toFixed(2),
        reorderPoint: null,
        leadTimeDays: m.leadTimeDays,
        unitCost: m.unitCost.toFixed(2),
        supplier: m.supplier,
        active: true,
      })),
    )
    .returning()

  const idBySku = new Map(inserted.map((r) => [r.sku, r.id] as const))
  const now = Date.now()
  const movementRows: (typeof schema.inventoryMovements.$inferInsert)[] = []

  for (const seed of MATERIAL_SEEDS) {
    const materialId = idBySku.get(seed.sku)!
    const isUnit = seed.unit === 'unidad'
    const q = (n: number) => (isUnit ? Math.max(0, Math.round(n)) : Math.max(0, round2(n)))

    // Consumo diario con ruido y tendencia.
    const salidas: number[] = []
    for (let d = 0; d < HISTORY_DAYS; d++) {
      const progress = d / (HISTORY_DAYS - 1)
      const rate = seed.baseRate * (1 + seed.trend * progress)
      salidas.push(q(rate * (0.75 + rng() * 0.5)))
    }
    const totalSalida = salidas.reduce((a, b) => a + b, 0)

    // Recepciones periódicas (entradas).
    const interval = Math.min(12, Math.max(5, Math.round(seed.leadTimeDays * 0.8)))
    const deliveryQty = q(seed.baseRate * interval * 1.15)
    const lastDeliveryDay = seed.atRisk ? HISTORY_DAYS - 23 : HISTORY_DAYS - 4
    const deliveries = new Map<number, number>()
    for (let d = interval; d <= lastDeliveryDay; d += interval) deliveries.set(d, deliveryQty)
    const totalEntrada = [...deliveries.values()].reduce((a, b) => a + b, 0)

    const endStock = q(seed.baseRate * seed.leadTimeDays * (seed.atRisk ? 0.85 : 3.2))
    let startStock = endStock + totalSalida - totalEntrada

    // Garantizar que ningún saldo intermedio quede negativo.
    let probe = startStock
    let minBalance = startStock
    for (let d = 0; d < HISTORY_DAYS; d++) {
      if (deliveries.has(d)) probe += deliveries.get(d)!
      probe -= salidas[d]
      minBalance = Math.min(minBalance, probe)
    }
    if (minBalance < seed.baseRate) startStock += seed.baseRate - minBalance

    // Recorrido cronológico definitivo.
    let balance = startStock
    for (let d = 0; d < HISTORY_DAYS; d++) {
      // d = HISTORY_DAYS - 1 corresponde a "ayer" para que ningún movimiento quede en el futuro.
      const dayStart = now - (HISTORY_DAYS - d) * DAY_MS
      if (deliveries.has(d)) {
        balance += deliveries.get(d)!
        movementRows.push({
          materialId,
          type: 'entrada',
          quantity: deliveries.get(d)!.toFixed(2),
          balanceAfter: round2(balance).toFixed(2),
          reason: 'Recepción de compra',
          reference: 'Recepción programada',
          createdAt: new Date(dayStart + 8 * 3600 * 1000),
        })
      }
      balance -= salidas[d]
      movementRows.push({
        materialId,
        type: 'salida',
        quantity: salidas[d].toFixed(2),
        balanceAfter: round2(balance).toFixed(2),
        reason: 'Orden de fabricación',
        reference: 'Consumo de producción',
        createdAt: new Date(dayStart + 15 * 3600 * 1000),
      })
    }

    await db
      .update(schema.materials)
      .set({ stock: round2(balance).toFixed(2) })
      .where(sql`${schema.materials.id} = ${materialId}`)
  }

  // Insertar el kardex en bloques para no armar una sola sentencia gigante.
  for (let i = 0; i < movementRows.length; i += 200) {
    await db.insert(schema.inventoryMovements).values(movementRows.slice(i, i + 200))
  }

  // Órdenes de compra de ejemplo.
  const year = new Date().getFullYear()
  await db.insert(schema.purchaseOrders).values([
    {
      code: `OC-${year}-001`,
      materialId: idBySku.get('MP-LAS-001')!,
      quantity: '5000.00',
      unitCost: '3.85',
      supplier: 'Química Andina S.A.',
      status: 'aprobada',
      origin: 'manual',
      rationale: null,
      expectedAt: new Date(now + 12 * DAY_MS),
      createdAt: new Date(now - 1 * DAY_MS),
    },
    {
      code: `OC-${year}-002`,
      materialId: idBySku.get('MP-STPP-003')!,
      quantity: '6000.00',
      unitCost: '1.95',
      supplier: 'Insumos del Pacífico',
      status: 'aprobada',
      origin: 'manual',
      rationale: null,
      expectedAt: new Date(now + 20 * DAY_MS),
      createdAt: new Date(now - 3 * DAY_MS),
    },
    {
      code: `OC-${year}-003`,
      materialId: idBySku.get('EN-BOT3L-009')!,
      quantity: '18000.00',
      unitCost: '0.34',
      supplier: 'Envases Nacionales Ltda.',
      status: 'en_transito',
      origin: 'ia',
      rationale: 'Consumo en aumento sostenido; recepción anticipada para evitar quiebre de línea de llenado 3 L.',
      expectedAt: new Date(now + 4 * DAY_MS),
      createdAt: new Date(now - 6 * DAY_MS),
    },
    {
      code: `OC-${year}-004`,
      materialId: idBySku.get('MP-CARB-004')!,
      quantity: '9000.00',
      unitCost: '0.72',
      supplier: 'Insumos del Pacífico',
      status: 'recibida',
      origin: 'manual',
      rationale: null,
      expectedAt: new Date(now - 5 * DAY_MS),
      createdAt: new Date(now - 15 * DAY_MS),
    },
  ])

  // Despachos de producto terminado (lotes aprobados por calidad).
  await db.insert(schema.shipments).values([
    {
      code: `ENV-${year}-001`,
      batchId: 'L-240810-11',
      product: 'Detergente polvo 500g',
      units: 900,
      destination: 'CEDI Central',
      carrier: 'Transportes AquaLog',
      status: 'entregado',
      dispatchedAt: new Date(now - 3 * DAY_MS),
      deliveredAt: new Date(now - 2 * DAY_MS),
      createdAt: new Date(now - 3 * DAY_MS),
    },
    {
      code: `ENV-${year}-002`,
      batchId: 'L-240809-04',
      product: 'Detergente líquido 3L',
      units: 1000,
      destination: 'CEDI Central',
      carrier: 'Transportes AquaLog',
      status: 'en_transito',
      dispatchedAt: new Date(now - 1 * DAY_MS),
      deliveredAt: null,
      createdAt: new Date(now - 1 * DAY_MS),
    },
  ])
  // El lote aprobado L-240808-09 se deja sin despacho para que aparezca como
  // "listo para despacho" en el módulo.
}
