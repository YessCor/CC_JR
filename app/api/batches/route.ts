import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { qualityBatches } from '@/lib/db/schema'

export async function GET() {
  const batches = await db.select().from(qualityBatches).orderBy(desc(qualityBatches.createdAt)).limit(50)
  return NextResponse.json(batches)
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const batchId = String(body.batchId ?? '').trim()
    const status = body.status === 'approved' ? 'approved' : body.status === 'pnc' ? 'pnc' : ''
    if (!batchId || !status) return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
    const [updated] = await db.update(qualityBatches).set({ status }).where(eq(qualityBatches.batchId, batchId)).returning()
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: 'Lote no encontrado.' }, { status: 404 })
  } catch { return NextResponse.json({ error: 'No fue posible actualizar el lote.' }, { status: 400 }) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const batchId = String(body.batchId ?? '').trim()
    const product = String(body.product ?? '').trim()
    const ph = Number(body.ph)
    const density = Number(body.density)
    const notes = body.notes ? String(body.notes).trim().slice(0, 1000) : null

    if (!batchId || !product || !Number.isFinite(ph) || !Number.isFinite(density)) {
      return NextResponse.json({ error: 'Completa todos los campos obligatorios.' }, { status: 400 })
    }

    const status = ph >= 6.5 && ph <= 10 && density >= 0.98 && density <= 1.04 ? 'approved' : 'pnc'
    const [created] = await db.insert(qualityBatches).values({
      batchId,
      product,
      ph: ph.toFixed(2),
      density: density.toFixed(3),
      status,
      notes: notes ?? (status === 'pnc' ? 'Parámetro fuera de rango; envío al CEDI bloqueado.' : null),
    }).returning()

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    const message = error instanceof Error && error.message.includes('unique')
      ? 'Ese ID de lote ya existe.'
      : 'No fue posible guardar el resultado.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
