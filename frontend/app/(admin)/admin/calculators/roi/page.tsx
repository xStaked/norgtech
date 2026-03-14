import { Beaker, TrendingUp } from 'lucide-react'
import { CalculatorNav } from '@/components/calculators/calculator-nav'
import { RoiForm } from '@/components/calculators/roi-form'
import { fetchFarms } from '../../farms/_lib/server-farms'
import { fetchRoiHistory } from '../_lib/server-calculators'

export default async function RoiCalculatorPage() {
  const [roiHistory, farms] = await Promise.all([
    fetchRoiHistory({ limit: 8 }),
    fetchFarms(),
  ])

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(26,58,42,0.08),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.12),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.94))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-white/90 shadow-sm">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-primary">
                <TrendingUp className="size-3.5" />
                Fase 5B
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Evalúa retorno económico de programas técnicos con trazabilidad por granja.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Cada cálculo ROI queda en historial individual para comparar decisiones y respaldar argumentos técnicos o comerciales.
                </p>
              </div>
              <CalculatorNav />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Cálculos recientes</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{roiHistory.items.length}</p>
              </div>
              <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-orange-700">Granjas disponibles</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{farms.items.length}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-white/70 p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <Beaker className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">ROI guardado con contexto productivo</h2>
              <p className="text-sm text-muted-foreground">
                Usa el cálculo para validar ensayos, justificar adopción de aditivos o comparar granjas.
              </p>
            </div>
          </div>

          <RoiForm farms={farms.items} initialHistory={roiHistory.items} />
        </section>
      </div>
    </div>
  )
}
