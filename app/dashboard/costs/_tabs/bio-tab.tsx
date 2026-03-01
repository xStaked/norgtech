import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { DollarSign, Droplets, FlaskConical } from 'lucide-react'
import { formatCOP } from '@/lib/market-data'
import { type Treatment } from '../types'

interface BioTabProps {
  treatments: Treatment[]
  totalBioRevenue: number
}

export function BioTab({ treatments, totalBioRevenue }: BioTabProps) {
  const validEffectiveness = treatments.filter(t => t.effectiveness != null)
  const avgEffectiveness = validEffectiveness.length > 0
    ? validEffectiveness.reduce((s, t) => s + t.effectiveness!, 0) / validEffectiveness.length
    : null

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos Bioremediación</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCOP(totalBioRevenue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Producto Vendido</CardTitle>
            <Droplets className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {treatments.reduce((s, t) => s + t.dose_liters, 0).toFixed(1)}{' '}
              <span className="text-sm font-normal">L</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Efectividad Promedio</CardTitle>
            <FlaskConical className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {avgEffectiveness != null ? `${avgEffectiveness.toFixed(0)}%` : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de Tratamientos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Estanque</TableHead>
                <TableHead>Dosis (L)</TableHead>
                <TableHead>Ingreso</TableHead>
                <TableHead>Efectividad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {treatments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No hay tratamientos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                treatments.map(t => (
                  <TableRow key={t.id} className="transition-colors hover:bg-muted/40">
                    <TableCell>{new Date(t.treatment_date + 'T12:00:00').toLocaleDateString('es-CO')}</TableCell>
                    <TableCell className="font-medium">{t.pond_name}</TableCell>
                    <TableCell>{t.dose_liters.toFixed(1)}</TableCell>
                    <TableCell className="font-medium text-primary">{formatCOP(t.revenue)}</TableCell>
                    <TableCell>
                      {t.effectiveness != null ? (
                        <Badge variant="outline" className={t.effectiveness >= 60 ? 'border-primary/30 text-primary' : 'border-amber-500/30 text-amber-600'}>
                          {t.effectiveness.toFixed(0)}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
