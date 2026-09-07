import Link from 'next/link'
import { ArrowRight, FlaskConical, LineChart, PackageSearch, Plus, ShieldCheck } from 'lucide-react'

type Module = {
  href: string
  title: string
  description: string
  icon: typeof FlaskConical
  tag: string
  available: boolean
}

const modules: Module[] = [
  {
    href: '/calidad',
    title: 'Control de calidad',
    description:
      'Captura de resultados de laboratorio, validación automática de lotes, cuarentena / PNC e historial de trazabilidad.',
    icon: FlaskConical,
    tag: 'Disponible',
    available: true,
  },
  {
    href: '#',
    title: 'Inventario de insumos',
    description: 'Existencias de materias primas, alertas de mínimos y consumo por lote de producción.',
    icon: PackageSearch,
    tag: 'Próximamente',
    available: false,
  },
  {
    href: '#',
    title: 'Indicadores de planta',
    description: 'Tableros de producción, rendimiento por turno y comparativos mensuales.',
    icon: LineChart,
    tag: 'Próximamente',
    available: false,
  },
  {
    href: '#',
    title: 'Auditorías y cumplimiento',
    description: 'Checklist de inspecciones, hallazgos y seguimiento de acciones correctivas.',
    icon: ShieldCheck,
    tag: 'Próximamente',
    available: false,
  },
]

export default function Page() {
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-5 sm:px-8">
          <div className="flex size-9 items-center justify-center rounded-xl bg-teal-700 text-white">
            <FlaskConical className="size-5" />
          </div>
          <div>
            <p className="font-bold tracking-tight text-slate-950">
              AQUA<span className="text-teal-700">LAB</span>
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Plataforma operativa
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 sm:px-8">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Elige una función
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Cada módulo cubre un proceso de la planta. Selecciona uno para empezar; se irán
            habilitando más con el tiempo.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {modules.map((module) => {
            const Icon = module.icon
            const card = (
              <>
                <div className="flex items-start justify-between">
                  <div
                    className={`rounded-xl p-3 ${
                      module.available ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    <Icon className="size-6" />
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                      module.available
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {module.tag}
                  </span>
                </div>
                <h2 className="mt-5 text-lg font-bold text-slate-950">{module.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p>
                {module.available && (
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-teal-700">
                    Abrir módulo <ArrowRight className="size-4" />
                  </span>
                )}
              </>
            )

            return module.available ? (
              <Link
                key={module.title}
                href={module.href}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-teal-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                {card}
              </Link>
            ) : (
              <div
                key={module.title}
                aria-disabled
                className="cursor-not-allowed rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 opacity-70"
              >
                {card}
              </div>
            )
          })}
        </div>

        <div className="mt-8 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          <Plus className="size-4 text-slate-400" />
          Los próximos módulos se agregan en <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">app/page.tsx</code>.
        </div>
      </main>
    </div>
  )
}
