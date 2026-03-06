import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { RecordsExport, SingleRecordExport } from '@/components/records-export'

export default async function RecordsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  let records: Array<{
    id: string
    record_date: string
    fish_count: number | null
    feed_kg: number | null
    avg_weight_kg: number | null
    mortality_count: number
    temperature_c: number | null
    oxygen_mg_l: number | null
    ammonia_mg_l: number | null
    nitrite_mg_l: number | null
    ph: number | null
    phosphate_mg_l: number | null
    hardness_mg_l: number | null
    alkalinity_mg_l: number | null
    calculated_fca: number | null
    calculated_biomass_kg: number | null
    notes: string | null
    created_at: string
    batch_id: string
  }> = []

  let batchPondMap: Record<string, string> = {}

  if (profile?.organization_id) {
    const { data: ponds } = await supabase
      .from('ponds')
      .select('id, name')
      .eq('organization_id', profile.organization_id)
      .order('sort_order', { ascending: true })
      .order('name')

    if (ponds && ponds.length > 0) {
      const pondIds = ponds.map(p => p.id)
      const { data: allBatches } = await supabase
        .from('batches')
        .select('id, pond_id')
        .in('pond_id', pondIds)

      if (allBatches) {
        for (const b of allBatches) {
          const pondName = ponds.find(p => p.id === b.pond_id)?.name ?? ''
          batchPondMap[b.id] = pondName
        }

        const batchIds = allBatches.map(b => b.id)
        if (batchIds.length > 0) {
          const { data: recs } = await supabase
            .from('production_records')
            .select('*')
            .in('batch_id', batchIds)
            .order('record_date', { ascending: false })
            .limit(100)

          records = (recs as typeof records) ?? []
        }
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Registros Productivos</h1>
          <p className="mt-1 text-muted-foreground">Historial completo de datos capturados</p>
        </div>
        <RecordsExport
          records={records.map((rec) => ({
            id: rec.id,
            record_date: rec.record_date,
            pond_name: batchPondMap[rec.batch_id] || '-',
            fish_count: rec.fish_count,
            feed_kg: rec.feed_kg,
            avg_weight_g: rec.avg_weight_kg != null ? rec.avg_weight_kg * 1000 : null,
            mortality_count: rec.mortality_count,
            temperature_c: rec.temperature_c,
            oxygen_mg_l: rec.oxygen_mg_l,
            ammonia_mg_l: rec.ammonia_mg_l,
            nitrite_mg_l: rec.nitrite_mg_l,
            ph: rec.ph,
            phosphate_mg_l: rec.phosphate_mg_l,
            hardness_mg_l: rec.hardness_mg_l,
            alkalinity_mg_l: rec.alkalinity_mg_l,
            calculated_fca: rec.calculated_fca,
            calculated_biomass_kg: rec.calculated_biomass_kg,
          }))}
        />
      </div>

      {records.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Sin registros</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Sube tu primer reporte fotografico en la seccion de Captura OCR para comenzar.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">
              {records.length} registros
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estanque</TableHead>
                  <TableHead className="text-right">Nº Peces</TableHead>
                  <TableHead className="text-right">Alimento (kg)</TableHead>
                  <TableHead className="text-right">Peso prom. (g)</TableHead>
                  <TableHead className="text-right">Mortalidad</TableHead>
                  <TableHead className="text-right">Temp. (C)</TableHead>
                  <TableHead className="text-right">O2 (mg/L)</TableHead>
                  <TableHead className="text-right">NH3</TableHead>
                  <TableHead className="text-right">NO2</TableHead>
                  <TableHead className="text-right">pH</TableHead>
                  <TableHead className="text-right">Fosfato (mg/L)</TableHead>
                  <TableHead className="text-right">Dureza (mg/L)</TableHead>
                  <TableHead className="text-right">Alcalinidad (mg/L)</TableHead>
                  <TableHead className="text-right">FCA</TableHead>
                  <TableHead className="text-right">Biomasa (kg)</TableHead>
                  <TableHead className="text-center">Descargar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((rec) => (
                  <TableRow key={rec.id} className="transition-colors duration-150 hover:bg-muted/50">
                    <TableCell className="font-medium">
                      {format(new Date(rec.record_date), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{batchPondMap[rec.batch_id] || '-'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{rec.fish_count ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.feed_kg?.toFixed(1) ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.avg_weight_g?.toFixed(1) ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      {rec.mortality_count > 0 ? (
                        <span className="text-destructive">{rec.mortality_count}</span>
                      ) : (
                        '0'
                      )}
                    </TableCell>
                    <TableCell className="text-right">{rec.temperature_c?.toFixed(1) ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.oxygen_mg_l?.toFixed(1) ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.ammonia_mg_l?.toFixed(2) ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.nitrite_mg_l?.toFixed(2) ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.ph?.toFixed(1) ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.phosphate_mg_l?.toFixed(2) ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.hardness_mg_l?.toFixed(1) ?? '-'}</TableCell>
                    <TableCell className="text-right">{rec.alkalinity_mg_l?.toFixed(1) ?? '-'}</TableCell>
                    <TableCell className="text-right">
                      {rec.calculated_fca ? rec.calculated_fca.toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {rec.calculated_biomass_kg ? rec.calculated_biomass_kg.toFixed(1) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <SingleRecordExport
                        record={{
                          id: rec.id,
                          record_date: rec.record_date,
                          pond_name: batchPondMap[rec.batch_id] || '-',
                          fish_count: rec.fish_count,
                          feed_kg: rec.feed_kg,
                          avg_weight_g: rec.avg_weight_kg != null ? rec.avg_weight_kg * 1000 : null,
                          mortality_count: rec.mortality_count,
                          temperature_c: rec.temperature_c,
                          oxygen_mg_l: rec.oxygen_mg_l,
                          ammonia_mg_l: rec.ammonia_mg_l,
                          nitrite_mg_l: rec.nitrite_mg_l,
                          ph: rec.ph,
                          phosphate_mg_l: rec.phosphate_mg_l,
                          hardness_mg_l: rec.hardness_mg_l,
                          alkalinity_mg_l: rec.alkalinity_mg_l,
                          calculated_fca: rec.calculated_fca,
                          calculated_biomass_kg: rec.calculated_biomass_kg,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
