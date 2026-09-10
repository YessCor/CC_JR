import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { DEMO_ADJUST_REF, applyDemoReorderAdjust, db, ensureDb } from '@/lib/db'
import { inventoryMovements } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

/** Botón temporal de presentación: re-aplica el stock de muestra en los insumos
 *  de reabastecimiento para que las sugerencias vuelvan a aparecer. */
export async function POST() {
  try {
    await ensureDb()
    await db.delete(inventoryMovements).where(eq(inventoryMovements.reference, DEMO_ADJUST_REF))
    await applyDemoReorderAdjust()
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'No se pudo restablecer las sugerencias de muestra.' }, { status: 400 })
  }
}