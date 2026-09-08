# AquaLab · Plataforma operativa

Plataforma para una planta de detergentes. Construida con Next.js 16 (App Router),
React 19, Tailwind CSS 4 y Drizzle ORM sobre PostgreSQL.

Módulos:

- **Control de calidad** (`/calidad`) — captura de resultados de laboratorio,
  validación automática de lotes, cuarentena / PNC e historial.
- **Logística e inventarios** (`/logistica`) — inventario de insumos, kardex,
  motor predictivo de demanda, órdenes de compra automáticas y despachos al CEDI.

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
| `/logistica` — [app/logistica/page.tsx](app/logistica/page.tsx) | Módulo de logística e inventarios |
| [components/quality-dashboard.tsx](components/quality-dashboard.tsx) | UI de calidad: resumen, captura, cuarentena, historial |
| [components/logistics-dashboard.tsx](components/logistics-dashboard.tsx) | UI de logística: resumen, inventario, movimientos, órdenes de compra, despachos |
| [app/api/batches/route.ts](app/api/batches/route.ts) | API de calidad: `GET` lista, `POST` registra y valida un lote, `PATCH` cambia el estado |
| [app/api/logistica/](app/api/logistica/) | API de logística (ver abajo) |
| [lib/forecast.ts](lib/forecast.ts) | Motor predictivo: media móvil ponderada + tendencia por regresión lineal |
| [lib/logistics.ts](lib/logistics.ts) | Helpers compartidos (enriquecer material con el forecast, códigos, whitelists) |
| [lib/db/schema.ts](lib/db/schema.ts) | Esquema Drizzle: `quality_batches`, `materials`, `inventory_movements`, `purchase_orders`, `shipments` |
| [lib/db/index.ts](lib/db/index.ts) | Conexión (PostgreSQL o PGlite) + creación/seed de tablas |

### API de logística

| Endpoint | Métodos |
| --- | --- |
| `/api/logistica/overview` | `GET` — KPIs, serie de consumo, valor por categoría y alertas predictivas |
| `/api/logistica/materials` | `GET` (enriquecido con el forecast) · `POST` (alta de insumo) |
| `/api/logistica/materials/[id]` | `PATCH` (parámetros: lead time, stock de seguridad, costo, punto de reorden…) |
| `/api/logistica/movements` | `GET` (kardex) · `POST` (entrada / salida / ajuste, recalcula el stock en transacción) |
| `/api/logistica/purchase-orders` | `GET` · `POST` (alta manual) · `PATCH` (transición de estado; al recibir ingresa el stock) |
| `/api/logistica/purchase-orders/suggest` | `GET` (vista previa) · `POST` (genera OC sugeridas por el motor predictivo) |
| `/api/logistica/shipments` | `GET` (envíos + lotes aprobados listos) · `POST` (solo lotes aprobados por calidad) · `PATCH` (estado) |

### Motor predictivo

`lib/forecast.ts` analiza los movimientos de tipo `salida` de cada insumo y estima:
uso diario proyectado (media ponderada con decaimiento exponencial + tendencia),
días de cobertura, fecha estimada de quiebre, punto de reorden dinámico
(`uso · lead time + stock de seguridad`) y la cantidad a ordenar. Todo corre
en el servidor, sin servicios externos ni API keys.

### Agregar un módulo nuevo

1. Crea `app/<nombre>/page.tsx` con tu UI.
2. Añade una entrada a `modules` en [app/page.tsx](app/page.tsx) con `available: true` y `href: '/<nombre>'`.

## Reglas de negocio

- **Calidad**: un lote se aprueba si `pH ∈ [6.5, 10]` y `densidad ∈ [0.98, 1.04]
  g/mL`; en caso contrario se marca como `pnc` y se bloquea el envío al CEDI. La
  lógica vive en el formulario (validación en vivo) y en el `POST` de la API
  (fuente de verdad).
- **Despachos**: solo se pueden crear envíos para lotes con estado `approved` en
  calidad. Cada lote tiene una columna `units` (por defecto 1000).
- **Inventario**: una `salida` nunca puede dejar el stock en negativo; un `ajuste`
  fija el stock al valor contado. Recibir una orden de compra crea automáticamente
  el movimiento de `entrada` correspondiente.

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
