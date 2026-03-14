import { Activity, BriefcaseBusiness, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DashboardAdvisorActivity } from '@/lib/api/dashboard'

interface AdvisorTableProps {
  items: DashboardAdvisorActivity[]
  mode: 'organization' | 'advisor'
}

export function AdvisorTable({ items, mode }: AdvisorTableProps) {
  return (
    <Card className="rounded-[2rem] border border-primary/10 bg-card/95 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl">
          {mode === 'organization' ? 'Actividad por asesor' : 'Tu ritmo operativo'}
        </CardTitle>
        <CardDescription>
          {mode === 'organization'
            ? 'Comparativo entre responsables técnicos y comerciales durante el mes en curso.'
            : 'Resumen de tus casos asignados y las visitas ejecutadas este mes.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-3xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>{mode === 'organization' ? 'Asesor' : 'Responsable'}</TableHead>
                <TableHead>Casos abiertos</TableHead>
                <TableHead>Casos cerrados</TableHead>
                <TableHead>Visitas del mes</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const balance = item.closedCases + item.visitsThisMonth - item.openCases

                return (
                  <TableRow key={item.advisorId}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <span className="text-xs text-muted-foreground">ID {item.advisorId.slice(0, 8)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-700">
                        <BriefcaseBusiness className="size-3.5" />
                        {item.openCases}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                        <CheckCircle2 className="size-3.5" />
                        {item.closedCases}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm text-sky-700">
                        <Activity className="size-3.5" />
                        {item.visitsThisMonth}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={
                          balance >= 0
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-orange-200 bg-orange-50 text-orange-700'
                        }
                      >
                        {balance >= 0 ? `+${balance}` : balance} balance
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
