import Link from 'next/link'
import { ArrowRight, ClipboardList } from 'lucide-react'
import { CaseStatusBadge } from '@/components/admin/case-status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCaseNumber } from '@/lib/api/cases'
import { fetchPortalCases } from '@/app/(portal)/portal/_lib/server-portal'

export async function PortalCasesView() {
  const response = await fetchPortalCases()

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-primary/10 bg-white/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge className="w-fit bg-primary/10 text-primary hover:bg-primary/10">
              <ClipboardList className="mr-1 size-3.5" />
              Casos
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Seguimiento de casos técnicos
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Aquí puedes revisar el estado de cada caso, la granja relacionada y la fecha de la última actualización visible.
              </p>
            </div>
          </div>
          <div className="rounded-[1.5rem] bg-primary/5 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-primary/70">Total</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{response.items.length}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {response.items.length > 0 ? (
          response.items.map((item) => (
            <Card key={item.id} className="rounded-[1.85rem] border-primary/10 bg-white/90 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                        {formatCaseNumber(item.caseNumber)}
                      </Badge>
                      {item.farm?.name ? <Badge variant="outline">{item.farm.name}</Badge> : null}
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-foreground">{item.title}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                        {item.description || 'Este caso no tiene descripción adicional visible por ahora.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2">
                    <CaseStatusBadge type="severity" value={item.severity} />
                    <CaseStatusBadge type="status" value={item.status} />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    Última actualización:{' '}
                    {new Intl.DateTimeFormat('es-CO', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(item.updatedAt))}
                  </p>
                  <Link
                    href={`/portal/cases/${item.id}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Ver detalle
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="rounded-[1.85rem] border-dashed border-primary/20 bg-white/80">
            <CardHeader>
              <CardTitle>Sin casos activos</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Cuando el equipo técnico abra un caso asociado a tu operación, aparecerá aquí.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
