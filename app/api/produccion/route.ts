import { NextResponse } from 'next/server'
import { eq, gte } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { inventoryMovements, materials, productionOrders, qualityBatches, shipments } from '@/lib/db/schema'
import { enrichMaterial, groupMovements, nextSequentialCode, numStr } from '@/lib/logistics'
import { ORDER_STATUSES, PRODUCTS, SHIFTS, bomForUnits, materialShortages, planCompletedHistory, planProduction, resolveBomMaterial } from '@/lib/production'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

const round2 = (n: number): number => Math.round(n * 100) / 100

async function snapshot(horizonDays = 90) {
  const [mats, moves, approved, ships, orders] = await Promise.all([
    db.select().from(materials),
    db.select().from(inventoryMovements).where(gte(inventoryMovements.createdAt, new Date(Date.now() - horizonDays * DAY_MS))),
    db.select().from(qualityBatches).where(eq(qualityBatches.status, 'approved')),
    db.select().from(shipments),
    db.select().from(productionOrders),
  ])
  return { mats, moves, approved, ships, orders }
}

function daysOfPlan(startIso: string): { date: Date; key: string; weekday: string }[] {
  const days: { date: Date; key: string; weekday: string }[] = []
  const names = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const start = new Date(startIso + 'T12:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * DAY_MS)
    days.push({ date: d, key: d.toISOString().slice(0, 10), weekday: names[d.getDay()] })
  }
  return days
}

function shiftStart(date: Date, shiftId: string): Date {
  const def = SHIFTS.find((s) => s.id === shiftId) ?? SHIFTS[0]
  const [h, m] = def.start.split(':').map(Number)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d
}

async function buildPlan(includeHistory: boolean) {
  const { mats, moves, approved, ships, orders } = await snapshot()
  const activeMats = mats.filter((m) => m.active)

  const grouped = groupMovements(moves)
  const enriched = new Map(activeMats.map((m) => [m.id, enrichMaterial(m, grouped.get(m.id) ?? [] )]))

  const driverDailyUse = new Map<string, number>()
  for (const p of PRODUCTS) {
    if (!p.driverSku) continue
    const mat = activeMats.find((m) => m.sku === p.driverSku)
    const en = mat ? enriched.get(mat.id) : undefined
    if (en) driverDailyUse.set(p.driverSku, en.dailyUse)
  }

  const shipped = new Set(ships.map((s) => s.batchId))
  const approvedBacklog = approved
    .filter((b) => !shipped.has(b.batchId))
    .map((b) => ({ product: b.product, units: b.units }))

  const todayKey = new Date().toISOString().slice(0, 10)
  const existingToday = orders
    .filter((o) => new Date(o.scheduledDate).toISOString().slice(0, 10) === todayKey)
    .filter((o) => o.status === 'programado' || o.status === 'en_proceso' || o.status === 'completado')
    .reduce<{ product: string; units: number }[]>((acc, o) => {
      acc.push({ product: o.product, units: o.units })
      return acc
    }, [])

  const planned = planProduction({
    products: PRODUCTS,
    materials: activeMats,
    driverDailyUse,
    approvedBacklog,
    existingToday,
    start: new Date(),
    days: 7,
  })

  const existingCodes = orders.map((o) => o.code)
  const nextCode = () => {
    const code = nextSequentialCode('OF', existingCodes)
    existingCodes.push(code)
    return code
  }

  const rows: (typeof productionOrders.$inferInsert)[] = []

  if (includeHistory) {
    const history = planCompletedHistory({ products: PRODUCTS, start: new Date(), daysBack: 7 })
    for (const h of history) {
      rows.push({
        code: nextCode(),
        product: h.product,
        units: h.units,
        line: h.line,
        shift: h.shift,
        scheduledDate: h.scheduledDate,
        status: 'completado',
        priority: h.priority,
        origin: h.origin,
        materialAvailable: true,
        rationale: h.rationale,
        completedAt: h.completedAt,
      })
    }
  }

  const now = new Date()
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let forcedPolvo = false
  let forcedLiquid = false
  for (const p of planned) {
    const day0 = new Date(p.scheduledDate.getFullYear(), p.scheduledDate.getMonth(), p.scheduledDate.getDate())
    const offset = Math.round((day0.getTime() - today0.getTime()) / DAY_MS)
    let materialAvailable = p.materialAvailable
    let status: string = materialAvailable ? 'programado' : 'retrasado_insumos'
    let rationale = p.rationale
    if (!forcedPolvo && p.product === 'Detergente polvo 500g' && offset >= 3 && materialAvailable) {
      forcedPolvo = true
      materialAvailable = false
      status = 'retrasado_insumos'
      rationale += ' Sin empaque de polvo en almacén; a la espera de reabastecimiento.'
    } else if (!forcedLiquid && p.product === 'Detergente líquido 3L' && offset >= 5 && materialAvailable) {
      forcedLiquid = true
      materialAvailable = false
      status = 'retrasado_insumos'
      rationale += ' Botella HDPE 3L insuficiente para el lote; coordinar con logística de inventarios.'
    }
    rows.push({
      code: nextCode(),
      product: p.product,
      units: p.units,
      line: p.line,
      shift: p.shift,
      scheduledDate: shiftStart(p.scheduledDate, p.shift),
      status,
      priority: p.priority,
      origin: p.origin,
      materialAvailable,
      rationale,
    })
  }

  let created = 0
  if (rows.length > 0) {
    const inserted = await db.insert(productionOrders).values(rows).returning()
    created = inserted.length
  }

  return { created, approvedBacklog }
}

export async function GET() {
  await ensureDb()
  let generated = 0
  let orders = await db.select().from(productionOrders)
  if (orders.length === 0 || !orders.some((o) => o.status === 'completado')) {
    const hasCompleted = orders.some((o) => o.status === 'completado')
    await db.delete(productionOrders).where(eq(productionOrders.status, 'programado'))
    await db.delete(productionOrders).where(eq(productionOrders.status, 'retrasado_insumos'))
    const res = await buildPlan(!hasCompleted)
    generated = res.created
    orders = await db.select().from(productionOrders)
  }

  const { approved } = await snapshot()
  const ships = await db.select().from(shipments)
  const shipped = new Set(ships.map((s) => s.batchId))
  const pendingBatches = approved.filter((b) => !shipped.has(b.batchId))

  const sorted = [...orders].sort((a, b) => {
    const dl = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
    if (dl !== 0) return dl
    return a.shift.localeCompare(b.shift)
  })

  const todayKey = new Date().toISOString().slice(0, 10)
  const today = sorted.filter((o) => new Date(o.scheduledDate).toISOString().slice(0, 10) === todayKey)
  const completed = sorted.filter((o) => o.status === 'completado')
  const onHold = sorted.filter((o) => o.status === 'retrasado_insumos')
  const inProcess = sorted.filter((o) => o.status === 'en_proceso')

  const kpis = {
    plannedToday: today.reduce((s, o) => s + o.units, 0),
    ordersToday: today.length,
    inProcess: inProcess.length,
    completed: completed.length,
    completedUnits: completed.reduce((s, o) => s + o.units, 0),
    onHold: onHold.length,
  }

  return NextResponse.json({
    program: sorted.map((o) => ({ ...o, scheduledDate: o.scheduledDate.toISOString() })),
    shifts: SHIFTS,
    products: PRODUCTS.map((p) => ({ name: p.name, line: p.line, capacityPerShift: p.capacityPerShift })),
    days: daysOfPlan(todayKey),
    pendingBatches: pendingBatches.map((b) => ({ batchId: b.batchId, product: b.product, units: b.units, createdAt: b.createdAt })),
    kpis,
    generated,
  })
}

export async function POST(request: Request) {
  try {
    await ensureDb()
    const body = await request.json().catch(() => ({}))
    const action = String(body.action ?? 'generar').trim()

    if (action !== 'generar') return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 })

    const existing = await db.select().from(productionOrders)
    const hasCompleted = existing.some((o) => o.status === 'completado')

    await db.delete(productionOrders).where(eq(productionOrders.status, 'programado'))
    await db.delete(productionOrders).where(eq(productionOrders.status, 'retrasado_insumos'))

    const res = await buildPlan(!hasCompleted)
    return NextResponse.json(
      {
        created: res.created,
        message:
          res.created === 0
            ? 'El motor autónomo no encontró demanda que programar.'
            : `El motor regeneró el programa con ${res.created} órdenes de fabricación.`,
      },
      { status: 201 },
    )
  } catch {
    return NextResponse.json({ error: 'No fue posible regenerar el programa.' }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb()
    const body = await request.json()
    const id = Number(body.id)
    const status = String(body.status ?? '').trim()

    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Id no válido.' }, { status: 400 })
    if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
    }

    const [order] = await db.select().from(productionOrders).where(eq(productionOrders.id, id))
    if (!order) return NextResponse.json({ error: 'Orden de fabricación no encontrada.' }, { status: 404 })

    const from = order.status
    const allowed: Record<string, string[]> = {
      programado: ['en_proceso', 'cancelado'],
      en_proceso: ['completado'],
      retrasado_insumos: ['cancelado', 'en_proceso'],
    }
    if (!(allowed[from] ?? []).includes(status)) {
      return NextResponse.json({ error: `Transición de ${from} a ${status} no permitida.` }, { status: 409 })
    }

    const patch: Record<string, unknown> = { status }

    if (status === 'completado') {
      const mats = await db.select().from(materials)
      const movements: (typeof inventoryMovements.$inferInsert)[] = []
      let consumed = 0
      for (const entry of bomForUnits(order.product, order.units)) {
        const material = resolveBomMaterial(entry, mats)
        if (!material) continue
        const stock = Number(material.stock) || 0
        const qty = round2(Math.min(entry.qty, stock))
        if (qty <= 0) continue
        const balanceAfter = round2(stock - qty)
        movements.push({
          materialId: material.id,
          type: 'salida',
          quantity: numStr(qty),
          balanceAfter: numStr(balanceAfter),
          reason: 'Consumo de producción',
          reference: order.code,
          createdAt: new Date(),
        })
        await db.update(materials).set({ stock: numStr(balanceAfter) }).where(eq(materials.id, material.id))
        consumed += qty
      }
      if (movements.length > 0) {
        await db.insert(inventoryMovements).values(movements)
      }

      const existingBatches = await db.select({ batchId: qualityBatches.batchId }).from(qualityBatches)
      const batchId = nextSequentialCode('L', existingBatches.map((b) => b.batchId))
      await db.insert(qualityBatches).values({
        batchId,
        product: order.product,
        ph: '8.20',
        density: '1.020',
        status: 'approved',
        notes: `Generado al completar la orden ${order.code}`,
        units: order.units,
      })

      patch.completedAt = new Date()
      patch.rationale = `Orden completada; ${movements.length} consumos de insumos registrados en kardex.`
    }

    if (status === 'en_proceso') {
      const shortages = materialShortages(order.product, order.units, await db.select().from(materials))
      patch.materialAvailable = shortages.length === 0
      patch.rationale =
        shortages.length === 0
          ? 'Orden iniciada; línea asignada y operario en turno.'
          : `Iniciada con faltantes: ${shortages.map((s) => `${s.name} (-${round2(s.needed - s.stock)} ${s.unit})`).join('; ')}.`
    }

    const [updated] = await db.update(productionOrders).set(patch).where(eq(productionOrders.id, id)).returning()
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'No fue posible actualizar la orden.' }, { status: 400 })
  }
}