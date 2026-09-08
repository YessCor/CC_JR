import { pgTable, bigserial, integer, boolean, text, numeric, timestamp } from 'drizzle-orm/pg-core'

export const qualityBatches = pgTable('quality_batches', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  batchId: text('batch_id').notNull().unique(),
  product: text('product').notNull(),
  ph: numeric('ph', { precision: 5, scale: 2 }).notNull(),
  density: numeric('density', { precision: 6, scale: 3 }).notNull(),
  status: text('status').notNull(),
  notes: text('notes'),
  units: integer('units').notNull().default(1000),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type QualityBatch = typeof qualityBatches.$inferSelect
export type NewQualityBatch = typeof qualityBatches.$inferInsert

/** Materias primas e insumos de empaque. */
export const materials = pgTable('materials', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  // tensioactivo | builder | fragancia | colorante | conservante | envase | etiqueta | otro
  category: text('category').notNull(),
  unit: text('unit').notNull(), // kg | L | unidad
  stock: numeric('stock', { precision: 12, scale: 2 }).notNull().default('0'),
  safetyStock: numeric('safety_stock', { precision: 12, scale: 2 }).notNull().default('0'),
  // Override manual del punto de reorden; null => se usa el punto de reorden dinámico.
  reorderPoint: numeric('reorder_point', { precision: 12, scale: 2 }),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  supplier: text('supplier'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Material = typeof materials.$inferSelect
export type NewMaterial = typeof materials.$inferInsert

/** Kardex: cada entrada, salida o ajuste de inventario. */
export const inventoryMovements = pgTable('inventory_movements', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  materialId: integer('material_id').notNull(),
  type: text('type').notNull(), // entrada | salida | ajuste
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(), // magnitud positiva
  balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
  reason: text('reason'),
  reference: text('reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type InventoryMovement = typeof inventoryMovements.$inferSelect
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert

/** Órdenes de compra (manuales o sugeridas por el motor predictivo). */
export const purchaseOrders = pgTable('purchase_orders', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  code: text('code').notNull().unique(), // OC-AAAA-NNN
  materialId: integer('material_id').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 2 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
  supplier: text('supplier'),
  // sugerida | aprobada | en_transito | recibida | cancelada
  status: text('status').notNull().default('sugerida'),
  origin: text('origin').notNull().default('manual'), // manual | ia
  rationale: text('rationale'),
  expectedAt: timestamp('expected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type PurchaseOrder = typeof purchaseOrders.$inferSelect
export type NewPurchaseOrder = typeof purchaseOrders.$inferInsert

/** Despachos de producto terminado hacia el CEDI. */
export const shipments = pgTable('shipments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  code: text('code').notNull().unique(), // ENV-AAAA-NNN
  batchId: text('batch_id').notNull(),
  product: text('product').notNull(),
  units: integer('units').notNull(),
  destination: text('destination').notNull().default('CEDI Central'),
  carrier: text('carrier'),
  // preparacion | en_transito | entregado | bloqueado
  status: text('status').notNull().default('preparacion'),
  dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Shipment = typeof shipments.$inferSelect
export type NewShipment = typeof shipments.$inferInsert
