import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { inventoryMovements, materials, purchaseOrders } from '@/lib/db/schema'
import { PO_STATUSES, nextSequentialCode, numStr } from '@/lib/logistics'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureDb()
  const rows = await db
    .select({
      id: purchaseOrders.id,
      code: purchaseOrders.code,
      materialId: purchaseOrders.materialId,
      materialName: materials.name,
      unit: materials.unit,
      quantity: purchaseOrders.quantity,
      unitCost: purchaseOrders.unitCost,
      supplier: purchaseOrders.supplier,
      status: purchaseOrders.status,
      origin: purchaseOrders.origin,
      rationale: purchaseOrders.rationale,
      expectedAt: purchaseOrders.expectedAt,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .leftJoin(materials, eq(purchaseOrders.materialId, materials.id))
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(100)
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  try {
    await ensureDb()
    const body = await request.json()
    const materialId = Number(body.materialId)
    const quantity = Number(body.quantity)
    const unitCostRaw = body.unitCost === undefined || body.unitCost === '' ? null : Number(body.unitCost)

    if (!Number.isInteger(materialId)) {
      return NextResponse.json({ error: 'Selecciona un insumo válido.' }, { status: 400 })
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'La cantidad debe ser mayor a cero.' }, { status: 400 })
    }

    const [material] = await db.select().from(materials).where(eq(materials.id, materialId))
    if (!material) return NextResponse.json({ error: 'Insumo no encontrado.' }, { status: 404 })

    const unitCost = unitCostRaw != null && Number.isFinite(unitCostRaw) && unitCostRaw >= 0 ? unitCostRaw : Number(material.unitCost) || 0
    const existing = await db.select({ code: purchaseOrders.code }).from(purchaseOrders)
    const code = nextSequentialCode(
      'OC',
      existing.map((r) => r.code),
    )

    const [created] = await db
      .insert(purchaseOrders)
      .values({
        code,
        materialId,
        quantity: numStr(quantity),
        unitCost: numStr(unitCost),
        supplier: body.supplier ? String(body.supplier).trim().slice(0, 200) : material.supplier,
        status: body.status === 'sugerida' ? 'sugerida' : 'aprobada',
        origin: body.origin === 'ia' ? 'ia' : 'manual',
        rationale: body.rationale ? String(body.rationale).trim().slice(0, 600) : null,
        expectedAt: new Date(Date.now() + material.leadTimeDays * 24 * 60 * 60 * 1000),
      })
      .returning()

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('unique')
        ? 'Ya existe una orden con ese código.'
        : 'No fue posible crear la orden de compra.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb()
    const body = await request.json()
    const id = Number(body.id)
    const status = String(body.status ?? '').trim()

    if (!Number.isInteger(id)) return NextResponse.json({ error: 'Id no válido.' }, { status: 400 })
    if (!PO_STATUSES.includes(status as (typeof PO_STATUSES)[number])) {
      return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
    }

    const result = await db.transaction(async (tx) => {
      const [po] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id))
      if (!po) return { error: 'Orden no encontrada.', status: 404 as const }
      if (po.status === status) return { po }

      // Al recibir la orden por primera vez, ingresa el stock automáticamente.
      if (status === 'recibida' && po.status !== 'recibida') {
        const [material] = await tx.select().from(materials).where(eq(materials.id, po.materialId))
        if (material) {
          const nextBalance = (Number(material.stock) || 0) + (Number(po.quantity) || 0)
          await tx.insert(inventoryMovements).values({
            materialId: po.materialId,
            type: 'entrada',
            quantity: numStr(Number(po.quantity) || 0),
            balanceAfter: numStr(nextBalance),
            reason: 'Recepción de compra',
            reference: po.code,
          })
          await tx.update(materials).set({ stock: numStr(nextBalance) }).where(eq(materials.id, po.materialId))
        }
      }

      const [updated] = await tx
        .update(purchaseOrders)
        .set({ status })
        .where(eq(purchaseOrders.id, id))
        .returning()
      return { po: updated }
    })

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result.po)
  } catch {
    return NextResponse.json({ error: 'No fue posible actualizar la orden.' }, { status: 400 })
  }
}
