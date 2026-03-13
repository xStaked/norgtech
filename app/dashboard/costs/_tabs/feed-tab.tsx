import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Circle } from 'lucide-react'
import { ConcentrateManager } from '@/components/concentrate-manager'
import { MonthlyFeedForm } from '@/components/monthly-feed-form'
import { type Concentrate, type FeedRecord, type BatchForForms } from '../types'

interface FeedTabProps {
  concentrates: Concentrate[]
  batchesForForms: BatchForForms[]
  feedRecords: FeedRecord[]
}

export function FeedTab({ concentrates, batchesForForms, feedRecords }: FeedTabProps) {
  const step1Done = concentrates.length > 0
  const step2Done = feedRecords.length > 0

  return (
    <div className="flex flex-col gap-6">
      {/* Step guide — visible until both steps are complete */}
      {(!step1Done || !step2Done) && (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cómo funciona la alimentación
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-3">
              {step1Done
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500 mt-0.5" />
                : <Circle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />}
              <div>
                <p className={`text-sm font-medium ${step1Done ? 'text-green-700' : 'text-foreground'}`}>
                  {step1Done
                    ? `Concentrados registrados (${concentrates.length})`
                    : 'Registra los concentrados / alimentos que usas'}
                </p>
                {!step1Done && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nombre, marca y precio por kg — lo encontrarás en el saco o factura del proveedor
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              {step2Done
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500 mt-0.5" />
                : <Circle className={`h-5 w-5 shrink-0 mt-0.5 ${step1Done ? 'text-amber-400' : 'text-muted-foreground/40'}`} />}
              <div>
                <p className={`text-sm font-medium ${step2Done ? 'text-green-700' : step1Done ? 'text-foreground' : 'text-muted-foreground/60'}`}>
                  {step2Done
                    ? `Consumo registrado (${feedRecords.length} registro${feedRecords.length !== 1 ? 's' : ''})`
                    : 'Registra cuántos kg usó cada estanque por mes'}
                </p>
                {!step2Done && step1Done && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Usa el botón "Registrar alimento" en la sección de abajo
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Concentrados registrados</CardTitle>
          <CardDescription>
            Alimentos que usa en su granja: nombre, marca, precio y % de proteína.
            Puedes agregar uno nuevo directamente desde el formulario de consumo.
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
            Registra cuánto concentrado usó en cada lote por mes y marca si el costo corresponde a levante o engorde.
            El costo se calcula automáticamente y así puedes acumular el levante dentro de la rentabilidad final del lote.
            {concentrates.length === 0 && (
              <span className="block mt-1 text-amber-600 font-medium">
                Puedes crear un concentrado directamente desde el formulario de registro.
              </span>
            )}
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
