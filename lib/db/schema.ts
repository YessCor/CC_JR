import { pgTable, bigserial, integer, boolean, text, numeric, timestamp } from 'drizzle-orm/pg-core'

export const qualityBatches = pgTable('quality_batches', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  batchId: text('batch_id').notNull().unique(),
  product: text('product').notNull(),
  ph: numeric('ph', { precision: 5, scale: 2 }).notNull(),
  density: numeric('density', { precision: 6, scale: 3 }).notNull(),
  status: text('status').notNull(), // approved | pnc
  notes: text('notes'),
  units: integer('units').notNull().default(1000), // cajas
  // Slotting / recepción en CEDI.
  // pendiente_ubicar | ubicado | no_aplica
  placementStatus: text('placement_status').notNull().default('pendiente_ubicar'),
  suggestedAisle: text('suggested_aisle'), // Pasillo: A | B | C
  suggestedRack: text('suggested_rack'), // Estante 01..08 (con padding)
  suggestedLevel: text('suggested_level'), // Nivel 1..3
  slottingCriterion: text('slotting_criterion'),
  distanceToDispatch: integer('distance_to_dispatch'), // metros a la salida de despachos
  weightKg: numeric('weight_kg', { precision: 12, scale: 2 }).notNull().default('0'),
  manufacturedAt: timestamp('manufactured_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  placedAt: timestamp('placed_at', { withTimezone: true }),
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

/** Órdenes de fabricación del programa de producción y turnos (mayormente autónomo). */
export const productionOrders = pgTable('production_orders', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  code: text('code').notNull().unique(), // OF-AAAA-NNN
  product: text('product').notNull(),
  units: integer('units').notNull(),
  line: text('line').notNull(), // A | B
  shift: text('shift').notNull(), // T1 | T2 | T3
  scheduledDate: timestamp('scheduled_date', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('programado'),
  priority: integer('priority').notNull().default(2),
  origin: text('origin').notNull().default('autonomo'), // autonomo | manual
  materialAvailable: boolean('material_available').notNull().default(true),
  rationale: text('rationale'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type ProductionOrder = typeof productionOrders.$inferSelect
export type NewProductionOrder = typeof productionOrders.$inferInsert
