import { NextResponse } from 'next/server'
import { gte } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { inventoryMovements, materials } from '@/lib/db/schema'
import { MATERIAL_CATEGORIES, MATERIAL_UNITS, enrichMaterial, groupMovements, numStr } from '@/lib/logistics'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET() {
  await ensureDb()
  const [mats, moves] = await Promise.all([
    db.select().from(materials),
    db.select().from(inventoryMovements).where(gte(inventoryMovements.createdAt, new Date(Date.now() - 90 * DAY_MS))),
  ])
  const grouped = groupMovements(moves)
  const rows = mats
    .map((m) => enrichMaterial(m, grouped.get(m.id) ?? []))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return NextResponse.json(rows)
}

export async function POST(request: Request) {
  try {
    await ensureDb()
    const body = await request.json()
    const sku = String(body.sku ?? '').trim().toUpperCase()
    const name = String(body.name ?? '').trim()
    const category = String(body.category ?? '').trim()
    const unit = String(body.unit ?? '').trim()
    const stock = Number(body.stock)
    const safetyStock = Number(body.safetyStock)
    const leadTimeDays = Math.round(Number(body.leadTimeDays))
    const unitCost = Number(body.unitCost)
    const supplier = body.supplier ? String(body.supplier).trim().slice(0, 200) : null

    if (!sku || !name) {
      return NextResponse.json({ error: 'El SKU y el nombre son obligatorios.' }, { status: 400 })
    }
    if (!MATERIAL_CATEGORIES.includes(category as (typeof MATERIAL_CATEGORIES)[number])) {
      return NextResponse.json({ error: 'Categoría no válida.' }, { status: 400 })
    }
    if (!MATERIAL_UNITS.includes(unit as (typeof MATERIAL_UNITS)[number])) {
      return NextResponse.json({ error: 'Unidad no válida.' }, { status: 400 })
    }
    if (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      return NextResponse.json({ error: 'Stock y costo deben ser números válidos.' }, { status: 400 })
    }

    const [created] = await db
      .insert(materials)
      .values({
        sku,
        name,
        category,
        unit,
        stock: numStr(stock),
        safetyStock: numStr(Number.isFinite(safetyStock) && safetyStock >= 0 ? safetyStock : 0),
        reorderPoint: null,
        leadTimeDays: Number.isFinite(leadTimeDays) && leadTimeDays > 0 ? leadTimeDays : 7,
        unitCost: numStr(unitCost),
        supplier,
        active: true,
      })
      .returning()

    if (stock > 0) {
      await db.insert(inventoryMovements).values({
        materialId: created.id,
        type: 'entrada',
        quantity: numStr(stock),
        balanceAfter: numStr(stock),
        reason: 'Inventario inicial',
        reference: 'Alta de insumo',
      })
    }

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('unique')
        ? 'Ya existe un insumo con ese SKU.'
        : 'No fue posible crear el insumo.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
