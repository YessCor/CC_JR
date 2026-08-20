import { pgTable, bigserial, text, numeric, timestamp } from 'drizzle-orm/pg-core'

export const qualityBatches = pgTable('quality_batches', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  batchId: text('batch_id').notNull().unique(),
  product: text('product').notNull(),
  ph: numeric('ph', { precision: 5, scale: 2 }).notNull(),
  density: numeric('density', { precision: 6, scale: 3 }).notNull(),
  status: text('status').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type QualityBatch = typeof qualityBatches.$inferSelect
export type NewQualityBatch = typeof qualityBatches.$inferInsert
