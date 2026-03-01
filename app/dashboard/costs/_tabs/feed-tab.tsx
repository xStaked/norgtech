import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConcentrateManager } from '@/components/concentrate-manager'
import { MonthlyFeedForm } from '@/components/monthly-feed-form'
import { type Concentrate, type FeedRecord, type BatchForForms } from '../types'

interface FeedTabProps {
  concentrates: Concentrate[]
  batchesForForms: BatchForForms[]
  feedRecords: FeedRecord[]
}

export function FeedTab({ concentrates, batchesForForms, feedRecords }: FeedTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Concentrados registrados</CardTitle>
          <CardDescription>
            Administra los alimentos que usa en su granja: nombre, marca, precio y % de proteína
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConcentrateManager concentrates={concentrates} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alimento consumido por mes</CardTitle>
          <CardDescription>
            Registra cuánto concentrado usó en cada lote por mes. El costo se calcula automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyFeedForm
            batches={batchesForForms}
            concentrates={concentrates.filter(c => c.is_active)}
            feedRecords={feedRecords}
          />
        </CardContent>
      </Card>
    </div>
  )
}
