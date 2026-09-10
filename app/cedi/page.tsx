import type { Metadata } from 'next'
import LotQrScanner from '@/components/lot-qr-scanner'

export const metadata: Metadata = {
  title: 'Recepción en CEDI | AquaLab',
  description: 'Escáner QR de lotes y posicionamiento sugerido en bodega (slotting FIFO).',
}

export default function Page() {
  return <LotQrScanner />
}