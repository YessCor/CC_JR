/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // En el motor de producción la app usa PostgreSQL real vía `pg` (ya external
  // por defecto). PGlite queda como fallback local y se excluye del bundling
  // para que su WASM no se empaquete en la función serverless de Vercel.
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default nextConfig
