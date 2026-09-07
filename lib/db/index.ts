import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { PGlite } from '@electric-sql/pglite'
import { Pool } from 'pg'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

/**
 * Data layer.
 *
 * - If `DATABASE_URL` is set, connect to a real PostgreSQL server (Neon, Supabase,
 *   Vercel Postgres, etc.) through node-postgres.
 * - Otherwise fall back to PGlite: an in-process PostgreSQL that persists to a local
 *   `.pglite` folder, so the project runs end to end with zero external setup.
 */

const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof createDb>
  ready?: Promise<void>
}

function createDb() {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    return drizzlePg(pool, { schema })
  }
  return drizzlePglite(new PGlite('.pglite'), { schema })
}

export const db = globalForDb.db ?? (globalForDb.db = createDb())

/**
 * Ensures the schema exists (and seeds a little demo data on first run).
 * Idempotent and executed at most once per process.
 */
export function ensureDb(): Promise<void> {
  if (!globalForDb.ready) {
    globalForDb.ready = bootstrap().catch((error) => {
      // Don't cache a failed bootstrap: let the next request try again.
      globalForDb.ready = undefined
      throw error
    })
  }
  return globalForDb.ready
}

async function bootstrap(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quality_batches (
      id bigserial PRIMARY KEY,
      batch_id text NOT NULL UNIQUE,
      product text NOT NULL,
      ph numeric(5, 2) NOT NULL,
      density numeric(6, 3) NOT NULL,
      status text NOT NULL,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  const existing = (await db.execute(
    sql`SELECT count(*)::int AS count FROM quality_batches`,
  )) as unknown as { rows: { count: number }[] }
  if ((existing.rows?.[0]?.count ?? 0) > 0) return

  await db.execute(sql`
    INSERT INTO quality_batches (batch_id, product, ph, density, status, notes, created_at) VALUES
      ('L-240812-07', 'Detergente líquido 3L', 10.80, 1.031, 'pnc', 'pH fuera de rango; envío al CEDI bloqueado.', now() - interval '2 days'),
      ('L-240811-03', 'Suavizante floral 1L', 7.90, 1.042, 'pnc', 'Densidad fuera de rango; envío al CEDI bloqueado.', now() - interval '3 days'),
      ('L-240810-11', 'Detergente polvo 500g', 8.20, 1.010, 'approved', NULL, now() - interval '4 days'),
      ('L-240809-04', 'Detergente líquido 3L', 8.10, 1.026, 'approved', NULL, now() - interval '5 days'),
      ('L-240808-09', 'Suavizante floral 1L', 7.80, 1.012, 'approved', NULL, now() - interval '6 days')
  `)
}
