import { NextResponse } from 'next/server'
import { gte, inArray } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { inventoryMovements, materials, purchaseOrders } from '@/lib/db/schema'
import { PO_OPEN_STATUSES, enrichMaterial, groupMovements, nextSequentialCode, numStr } from '@/lib/logistics'
import { RISK_ORDER } from '@/lib/forecast'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

async function computeSuggestions() {
  const [mats, moves, openPos] = await Promise.all([
    db.select().from(materials),
    db.select().from(inventoryMovements).where(gte(inventoryMovements.createdAt, new Date(Date.now() - 90 * DAY_MS))),
    db
      .select({ materialId: purchaseOrders.materialId })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.status, [...PO_OPEN_STATUSES])),
  ])
  const grouped = groupMovements(moves)
  const withOpenPo = new Set(openPos.map((p) => p.materialId))

  return mats
    .filter((m) => m.active)
    .map((m) => ({ material: m, forecast: enrichMaterial(m, grouped.get(m.id) ?? []) }))
    .filter(({ forecast }) => forecast.shouldOrder && forecast.suggestedQty > 0)
    .map(({ material, forecast }) => ({
      materialId: material.id,
      sku: material.sku,
      name: material.name,
      unit: material.unit,
      supplier: material.supplier,
      quantity: forecast.suggestedQty,
      unitCost: Number(material.unitCost) || 0,
      leadTimeDays: material.leadTimeDays,
      risk: forecast.risk,
      coverageDays: forecast.coverageDays,
      stockoutDate: forecast.stockoutDate,
      rationale: forecast.rationale,
      hasOpenPo: withOpenPo.has(material.id),
    }))
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk])
}

/** Vista previa: calcula sin escribir nada. */
export async function GET() {
  await ensureDb()
  return NextResponse.json(await computeSuggestions())
}

/** Genera y persiste las órdenes de compra sugeridas por el motor predictivo. */
export async function POST() {
  try {
    await ensureDb()
    const suggestions = await computeSuggestions()
    const toCreate = suggestions.filter((s) => !s.hasOpenPo)
    const skipped = suggestions.filter((s) => s.hasOpenPo).map((s) => s.name)

    if (toCreate.length === 0) {
      return NextResponse.json({ created: [], skipped, message: 'No hay insumos que requieran reorden en este momento.' })
    }

    const existing = await db.select({ code: purchaseOrders.code }).from(purchaseOrders)
    const codes = existing.map((r) => r.code)
    const created = []

    for (const s of toCreate) {
      const code = nextSequentialCode('OC', codes)
      codes.push(code)
      const [po] = await db
        .insert(purchaseOrders)
        .values({
          code,
          materialId: s.materialId,
          quantity: numStr(s.quantity),
          unitCost: numStr(s.unitCost),
          supplier: s.supplier,
          status: 'sugerida',
          origin: 'ia',
          rationale: s.rationale,
          expectedAt: new Date(Date.now() + s.leadTimeDays * DAY_MS),
        })
        .returning()
      created.push(po)
    }

    return NextResponse.json({ created, skipped }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'No fue posible generar las sugerencias.' }, { status: 400 })
  }
}
