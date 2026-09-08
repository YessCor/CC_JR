import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { qualityBatches, shipments } from '@/lib/db/schema'
import { SHIPMENT_STATUSES, nextSequentialCode } from '@/lib/logistics'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureDb()
  const [rows, approved] = await Promise.all([
    db.select().from(shipments).orderBy(desc(shipments.createdAt)).limit(100),
    db.select().from(qualityBatches).where(eq(qualityBatches.status, 'approved')),
  ])
  const shipped = new Set(rows.map((s) => s.batchId))
  const readyBatches = approved
    .filter((b) => !shipped.has(b.batchId))
    .map((b) => ({ batchId: b.batchId, product: b.product, units: b.units, createdAt: b.createdAt }))
  return NextResponse.json({ shipments: rows, readyBatches })
}

export async function POST(request: Request) {
  try {
    await ensureDb()
    const body = await request.json()
    const batchId = String(body.batchId ?? '').trim()
    const unitsRaw = body.units === undefined || body.units === '' ? null : Math.round(Number(body.units))
    const destination = body.destination ? String(body.destination).trim().slice(0, 120) : 'CEDI Central'
    const carrier = body.carrier ? String(body.carrier).trim().slice(0, 120) : null

    if (!batchId) return NextResponse.json({ error: 'Indica el lote a despachar.' }, { status: 400 })

    const [batch] = await db.select().from(qualityBatches).where(eq(qualityBatches.batchId, batchId))
    if (!batch) return NextResponse.json({ error: 'El lote no existe en control de calidad.' }, { status: 404 })
    if (batch.status !== 'approved') {
      return NextResponse.json(
        { error: 'El lote no está aprobado por calidad; no se puede despachar al CEDI.' },
        { status: 409 },
      )
    }

    const [dup] = await db.select({ id: shipments.id }).from(shipments).where(eq(shipments.batchId, batchId))
    if (dup) return NextResponse.json({ error: 'Ese lote ya tiene un despacho registrado.' }, { status: 409 })

    const units = unitsRaw != null && Number.isFinite(unitsRaw) && unitsRaw > 0 ? unitsRaw : batch.units
    const existing = await db.select({ code: shipments.code }).from(shipments)
    const code = nextSequentialCode(
      'ENV',
      existing.map((r) => r.code),
    )

    const [created] = await db
      .insert(shipments)
      .values({ code, batchId, product: batch.product, units, destination, carrier, status: 'preparacion' })
      .returning()

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('unique')
        ? 'Ese lote ya tiene un despacho registrado.'
        : 'No fue posible crear el despacho.'
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
    if (!SHIPMENT_STATUSES.includes(status as (typeof SHIPMENT_STATUSES)[number])) {
      return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
    }

    const patch: Record<string, unknown> = { status }
    if (status === 'en_transito') patch.dispatchedAt = new Date()
    if (status === 'entregado') patch.deliveredAt = new Date()

    const [updated] = await db.update(shipments).set(patch).where(eq(shipments.id, id)).returning()
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: 'Despacho no encontrado.' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'No fue posible actualizar el despacho.' }, { status: 400 })
  }
}
