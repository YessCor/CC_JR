# AquaLab · Control de calidad

Panel de control de calidad y Producto No Conforme (PNC) para una planta de
detergentes. Construido con Next.js 16 (App Router), React 19, Tailwind CSS 4 y
Drizzle ORM sobre PostgreSQL.

## Puesta en marcha

```bash
pnpm install
pnpm dev
```

Abre http://localhost:3000.

No necesitas configurar nada más: si `DATABASE_URL` no está definida, la app usa
**PGlite** (un PostgreSQL embebido que se guarda en la carpeta local `.pglite/`)
y siembra unos lotes de ejemplo la primera vez.

## Base de datos en producción

Define `DATABASE_URL` (Neon, Supabase, Vercel Postgres, etc.) en `.env.local`:

```
DATABASE_URL="postgresql://usuario:contraseña@host:5432/basededatos?sslmode=require"
```

Con esa variable presente, la app se conecta a ese PostgreSQL vía `node-postgres`
en lugar de PGlite. La tabla `quality_batches` se crea automáticamente en el
primer arranque (`ensureDb()` en [lib/db/index.ts](lib/db/index.ts)).

## Estructura

| Ruta | Descripción |
| --- | --- |
| `/` — [app/page.tsx](app/page.tsx) | Página principal: selector de módulos. Agrega módulos nuevos en el array `modules` |
| `/calidad` — [app/calidad/page.tsx](app/calidad/page.tsx) | Módulo de control de calidad |
| [components/quality-dashboard.tsx](components/quality-dashboard.tsx) | UI completa del módulo: resumen, captura, cuarentena, historial |
| [app/api/batches/route.ts](app/api/batches/route.ts) | API REST: `GET` lista, `POST` registra y valida un lote, `PATCH` cambia el estado |
| [lib/db/schema.ts](lib/db/schema.ts) | Esquema Drizzle de `quality_batches` |
| [lib/db/index.ts](lib/db/index.ts) | Conexión (PostgreSQL o PGlite) + creación/seed de tabla |

### Agregar un módulo nuevo

1. Crea `app/<nombre>/page.tsx` con tu UI.
2. Añade una entrada a `modules` en [app/page.tsx](app/page.tsx) con `available: true` y `href: '/<nombre>'`.

## Reglas de negocio

Un lote se aprueba si `pH ∈ [6.5, 10]` y `densidad ∈ [0.98, 1.04] g/mL`; en caso
contrario se marca como `pnc` y se bloquea el envío al CEDI. La lógica vive tanto
en el formulario (validación en vivo) como en el `POST` de la API (fuente de
verdad).

## Scripts

- `pnpm dev` — servidor de desarrollo (Turbopack)
- `pnpm build` — build de producción
- `pnpm start` — sirve el build de producción

## Problemas conocidos

- Si el servidor no cerró bien (un `node.exe` huérfano en Windows), el siguiente
  arranque puede fallar al abrir `.pglite`. Solución: cierra los procesos `node`
  sobrantes y borra la carpeta `.pglite/` (se vuelve a crear y sembrar sola).
- `pnpm build` ignora dos avisos de TypeScript preexistentes en
  `components/quality-dashboard.tsx` (comparaciones muertas dentro de la vista
  "Resumen"); no afectan el funcionamiento.
