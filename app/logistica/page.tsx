import type { Metadata } from 'next'
import LogisticsDashboard from '@/components/logistics-dashboard'

export const metadata: Metadata = {
  title: 'Logística e inventarios | AquaLab',
  description:
    'Inventario de insumos, kardex, pronóstico de demanda, órdenes de compra automáticas y despachos al CEDI.',
}

export default function Page() {
  return <LogisticsDashboard />
}
