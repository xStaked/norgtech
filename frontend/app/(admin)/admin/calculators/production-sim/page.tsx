import { Activity, Orbit } from 'lucide-react'
import { CalculatorNav } from '@/components/calculators/calculator-nav'
import { ProductionSimForm } from '@/components/calculators/production-sim-form'
import { fetchFarms } from '../../farms/_lib/server-farms'

export default async function ProductionSimulationPage() {
  const farms = await fetchFarms()

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.08),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(15,118,110,0.08),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(250,250,249,0.92))] p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-primary/10 bg-white/90 shadow-sm">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-orange-700">
                <Orbit className="size-3.5" />
                Fase 5B
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Proyecta biomasa, alimento y margen por semana antes de cerrar un escenario.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  El simulador ajusta la curva según broiler, ponedora o cerdo y devuelve una lectura económica de cierre sin persistir datos.
                </p>
              </div>
              <CalculatorNav />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-teal-200 bg-teal-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-teal-700">Programas</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">3</p>
              </div>
              <div className="rounded-3xl border border-primary/15 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-primary">Granjas referencia</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{farms.items.length}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-white/70 p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-orange-100 p-2 text-orange-700">
              <Activity className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Modelo semanal para cerrar supuestos</h2>
              <p className="text-sm text-muted-foreground">
                Ajusta conversión, mortalidad y precios para tensionar el escenario antes de ir a campo o presentar una propuesta.
              </p>
            </div>
          </div>

          <ProductionSimForm farms={farms.items} />
        </section>
      </div>
    </div>
  )
}
