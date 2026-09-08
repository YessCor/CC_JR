import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { inventoryMovements, materials } from '@/lib/db/schema'
import { MOVEMENT_TYPES, numStr } from '@/lib/logistics'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureDb()
  const rows = await db
    .select({
      id: inventoryMovements.id,
      materialId: inventoryMovements.materialId,
      materialName: materials.name,
      unit: materials.unit,
      type: inventoryMovements.type,
      quantity: inventoryMovements.quantity,
      balanceAfter: inventoryMovements.balanceAfter,
      reason: inventoryMovements.reason,
      reference: inventoryMovements.reference,
      createdAt: inventoryMovements.createdAt,
    })
    .from(inventoryMovements)
    .leftJoin(materials, eq(inventoryMovements.materialId, materials.id))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(80)
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  try {
    await ensureDb()
    const body = await request.json()
    const materialId = Number(body.materialId)
    const type = String(body.type ?? '').trim()
    const quantity = Number(body.quantity)
    const reason = body.reason ? String(body.reason).trim().slice(0, 300) : null
    const reference = body.reference ? String(body.reference).trim().slice(0, 200) : null

    if (!Number.isInteger(materialId)) {
      return NextResponse.json({ error: 'Selecciona un insumo válido.' }, { status: 400 })
    }
    if (!MOVEMENT_TYPES.includes(type as (typeof MOVEMENT_TYPES)[number])) {
      return NextResponse.json({ error: 'Tipo de movimiento no válido.' }, { status: 400 })
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json({ error: 'La cantidad debe ser un número válido.' }, { status: 400 })
    }
    if (type !== 'ajuste' && quantity === 0) {
      return NextResponse.json({ error: 'La cantidad debe ser mayor a cero.' }, { status: 400 })
    }

    const result = await db.transaction(async (tx) => {
      const [material] = await tx.select().from(materials).where(eq(materials.id, materialId))
      if (!material) return { error: 'Insumo no encontrado.', status: 404 as const }

      const current = Number(material.stock) || 0
      let nextBalance: number
      if (type === 'entrada') nextBalance = current + quantity
      else if (type === 'salida') nextBalance = current - quantity
      else nextBalance = quantity // ajuste: fija el stock al valor indicado

      if (nextBalance < 0) {
        return { error: `Stock insuficiente: hay ${current} ${material.unit} disponibles.`, status: 400 as const }
      }

      const [movement] = await tx
        .insert(inventoryMovements)
        .values({
          materialId,
          type,
          quantity: numStr(type === 'ajuste' ? Math.abs(nextBalance - current) : quantity),
          balanceAfter: numStr(nextBalance),
          reason: reason ?? (type === 'ajuste' ? 'Ajuste de inventario' : null),
          reference,
        })
        .returning()

      const [updatedMaterial] = await tx
        .update(materials)
        .set({ stock: numStr(nextBalance) })
        .where(eq(materials.id, materialId))
        .returning()

      return { movement, material: updatedMaterial }
    })

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'No fue posible registrar el movimiento.' }, { status: 400 })
  }
}
