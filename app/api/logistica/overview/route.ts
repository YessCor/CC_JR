import { NextResponse } from 'next/server'
import { gte } from 'drizzle-orm'
import { db, ensureDb } from '@/lib/db'
import { inventoryMovements, materials, purchaseOrders, shipments } from '@/lib/db/schema'
import { PO_OPEN_STATUSES, enrichMaterial, groupMovements, totalConsumptionSeries } from '@/lib/logistics'
import { RISK_ORDER } from '@/lib/forecast'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET() {
  await ensureDb()

  const [mats, moves, pos, ships] = await Promise.all([
    db.select().from(materials),
    db.select().from(inventoryMovements).where(gte(inventoryMovements.createdAt, new Date(Date.now() - 90 * DAY_MS))),
    db.select().from(purchaseOrders),
    db.select().from(shipments),
  ])

  const grouped = groupMovements(moves)
  const enriched = mats.map((m) => enrichMaterial(m, grouped.get(m.id) ?? []))

  const inventoryValue = enriched.reduce((sum, m) => sum + m.inventoryValue, 0)
  const atRisk = enriched.filter((m) => m.risk === 'critico' || m.risk === 'alto')
  const finiteCoverage = enriched.filter((m) => typeof m.coverageDays === 'number') as { coverageDays: number }[]
  const avgCoverageDays = finiteCoverage.length
    ? finiteCoverage.reduce((s, m) => s + m.coverageDays, 0) / finiteCoverage.length
    : 0

  const openPos = pos.filter((p) => (PO_OPEN_STATUSES as readonly string[]).includes(p.status))
  const openPoValue = openPos.reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.unitCost) || 0), 0)

  const valueByCategory = Object.entries(
    enriched.reduce<Record<string, number>>((acc, m) => {
      acc[m.category] = (acc[m.category] ?? 0) + m.inventoryValue
      return acc
    }, {}),
  )
    .map(([category, value]) => ({ category, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)

  const topAlerts = enriched
    .filter((m) => m.shouldOrder)
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk])
    .slice(0, 6)
    .map((m) => ({
      materialId: m.id,
      sku: m.sku,
      name: m.name,
      unit: m.unit,
      stock: m.stockNum,
      coverageDays: m.coverageDays,
      stockoutDate: m.stockoutDate,
      suggestedQty: m.suggestedQty,
      unitCost: m.unitCostNum,
      risk: m.risk,
      rationale: m.rationale,
    }))

  return NextResponse.json({
    kpis: {
      inventoryValue: Math.round(inventoryValue),
      materialsTotal: mats.length,
      materialsAtRisk: atRisk.length,
      avgCoverageDays: Math.round(avgCoverageDays * 10) / 10,
      openPos: openPos.length,
      openPoValue: Math.round(openPoValue),
      shipmentsInTransit: ships.filter((s) => s.status === 'en_transito').length,
      shipmentsPreparing: ships.filter((s) => s.status === 'preparacion').length,
    },
    consumptionSeries: totalConsumptionSeries(moves, 30),
    valueByCategory,
    topAlerts,
  })
}
