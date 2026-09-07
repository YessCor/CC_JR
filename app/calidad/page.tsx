import type { Metadata } from 'next'
import QualityDashboard from '@/components/quality-dashboard'

export const metadata: Metadata = {
  title: 'Control de calidad | AquaLab',
  description: 'Captura de resultados, cuarentena / PNC e historial de lotes.',
}

export default function Page() {
  return <QualityDashboard />
}
