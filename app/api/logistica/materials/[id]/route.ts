import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { materials } from '@/lib/db/schema'
import { MATERIAL_CATEGORIES, numStr } from '@/lib/logistics'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb()
    const { id } = await ctx.params
    const materialId = Number(id)
    if (!Number.isInteger(materialId)) {
      return NextResponse.json({ error: 'Id no válido.' }, { status: 400 })
    }

    const body = await request.json()
    const patch: Record<string, unknown> = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) return NextResponse.json({ error: 'El nombre no puede quedar vacío.' }, { status: 400 })
      patch.name = name
    }
    if (body.category !== undefined) {
      const category = String(body.category).trim()
      if (!MATERIAL_CATEGORIES.includes(category as (typeof MATERIAL_CATEGORIES)[number])) {
        return NextResponse.json({ error: 'Categoría no válida.' }, { status: 400 })
      }
      patch.category = category
    }
    if (body.supplier !== undefined) {
      patch.supplier = body.supplier ? String(body.supplier).trim().slice(0, 200) : null
    }
    if (body.active !== undefined) patch.active = Boolean(body.active)

    if (body.safetyStock !== undefined) {
      const v = Number(body.safetyStock)
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Stock de seguridad no válido.' }, { status: 400 })
      patch.safetyStock = numStr(v)
    }
    if (body.unitCost !== undefined) {
      const v = Number(body.unitCost)
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Costo unitario no válido.' }, { status: 400 })
      patch.unitCost = numStr(v)
    }
    if (body.leadTimeDays !== undefined) {
      const v = Math.round(Number(body.leadTimeDays))
      if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ error: 'Lead time no válido.' }, { status: 400 })
      patch.leadTimeDays = v
    }
    if (body.reorderPoint !== undefined) {
      if (body.reorderPoint === null || body.reorderPoint === '') {
        patch.reorderPoint = null
      } else {
        const v = Number(body.reorderPoint)
        if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Punto de reorden no válido.' }, { status: 400 })
        patch.reorderPoint = numStr(v)
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No hay cambios que aplicar.' }, { status: 400 })
    }

    const [updated] = await db.update(materials).set(patch).where(eq(materials.id, materialId)).returning()
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: 'Insumo no encontrado.' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'No fue posible actualizar el insumo.' }, { status: 400 })
  }
}
