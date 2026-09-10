import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { qualityBatches } from '@/lib/db/schema'
import { suggestSlotting, type SlottingSuggestion } from '@/lib/slotting'

export const dynamic = 'force-dynamic'

type QualityBatchRow = typeof qualityBatches.$inferSelect

/**
 * Reconstruye la sugerencia de la fila si ya fue persistida (seed o colocación
 * confirmada); de lo contrario la calcula de forma determinista.
 */
function resolveSlotting(batch: QualityBatchRow): SlottingSuggestion {
  if (batch.suggestedAisle && batch.suggestedRack && batch.suggestedLevel) {
    const suggestion = suggestSlotting(batch.batchId, batch.product)
    const distance = batch.distanceToDispatch ?? suggestion.distanceToDispatch
    const level = Number(batch.suggestedLevel) || suggestion.level
    return {
      ...suggestion,
      aisle: batch.suggestedAisle,
      rack: batch.suggestedRack,
      level,
      cell: `${batch.suggestedAisle}-${batch.suggestedRack} / Nivel ${level}`,
      criterion: batch.slottingCriterion ?? suggestion.criterion,
      distanceToDispatch: distance,
    }
  }
  return suggestSlotting(batch.batchId, batch.product)
}

function serialize(batch: QualityBatchRow, slotting: SlottingSuggestion) {
  const placeable = batch.status === 'approved' && batch.placementStatus !== 'ubicado'
  return {
    lot: {
      batchId: batch.batchId,
      product: batch.product,
      ph: batch.ph,
      density: batch.density,
      notes: batch.notes ?? null,
      units: batch.units,
      weightKg: Number(batch.weightKg) || 0,
      status: batch.status,
      placementStatus: batch.placementStatus,
      manufacturedAt: batch.manufacturedAt ?? null,
      expiresAt: batch.expiresAt ?? null,
      placedAt: batch.placedAt ?? null,
      createdAt: batch.createdAt,
    },
    slotting,
    placeable,
  }
}

export async function GET(request: Request) {
  try {
    await ensureDb()
    const url = new URL(request.url)
    const query = String(url.searchParams.get('q') ?? '').trim().toUpperCase()
    if (!query) return NextResponse.json({ error: 'Indica un ID de lote a consultar.' }, { status: 400 })

    const [batch] = await db.select().from(qualityBatches).where(eq(qualityBatches.batchId, query))
    if (!batch) return NextResponse.json({ error: `El lote "${query}" no existe en la plataforma.` }, { status: 404 })

    return NextResponse.json(serialize(batch, resolveSlotting(batch)))
  } catch {
    return NextResponse.json({ error: 'No fue posible consultar el lote.' }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureDb()
    const body = await request.json()
    const batchId = String(body.batchId ?? '').trim().toUpperCase()
    if (!batchId) return NextResponse.json({ error: 'Indica el lote a ubicar.' }, { status: 400 })

    const [batch] = await db.select().from(qualityBatches).where(eq(qualityBatches.batchId, batchId))
    if (!batch) return NextResponse.json({ error: 'El lote no existe en control de calidad.' }, { status: 404 })
    if (batch.status !== 'approved') {
      return NextResponse.json(
        { error: 'El lote no está aprobado por calidad; no se puede ubicar en el CEDI.' },
        { status: 409 },
      )
    }
    if (batch.placementStatus === 'ubicado') {
      return NextResponse.json(serialize(batch, resolveSlotting(batch)))
    }

    const suggestion = resolveSlotting(batch)
    const [updated] = await db
      .update(qualityBatches)
      .set({
        placementStatus: 'ubicado',
        placedAt: new Date(),
        suggestedAisle: batch.suggestedAisle ?? suggestion.aisle,
        suggestedRack: batch.suggestedRack ?? suggestion.rack,
        suggestedLevel: batch.suggestedLevel ?? String(suggestion.level),
        slottingCriterion: batch.slottingCriterion ?? suggestion.criterion,
        distanceToDispatch: batch.distanceToDispatch ?? suggestion.distanceToDispatch,
      })
      .where(eq(qualityBatches.batchId, batchId))
      .returning()

    return NextResponse.json(serialize(updated, resolveSlotting(updated)))
  } catch {
    return NextResponse.json({ error: 'No fue posible confirmar la colocación.' }, { status: 400 })
  }
}