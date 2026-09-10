import type { Metadata } from 'next'
import ProductionDashboard from '@/components/production-dashboard'

export const metadata: Metadata = {
  title: 'Producción y turnos | AquaLab',
  description:
    'Programa de producción autónomo: órdenes de fabricación generadas por demanda proyectada, distribución en turnos y consumo de insumos al completar.',
}

export default function Page() {
  return <ProductionDashboard />
}