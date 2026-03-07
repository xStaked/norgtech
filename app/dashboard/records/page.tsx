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

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ pond?: string; from?: string; to?: string; page?: string }>
}) {
  const { pond: pondFilter, from: fromDateFilter, to: toDateFilter, page: pageParam } = await searchParams
  const currentPage = Number(pageParam) > 0 ? Math.floor(Number(pageParam)) : 1
  const pageSize = 100
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
  let ponds: Array<{ id: string; name: string }> = []
  let totalRecords = 0

  if (profile?.organization_id) {
    const { data: organizationPonds } = await supabase
      .from('ponds')
      .select('id, name')
      .eq('organization_id', profile.organization_id)
      .order('sort_order', { ascending: true })
      .order('name')

    ponds = organizationPonds ?? []

    if (ponds && ponds.length > 0) {
      const selectedPondId = pondFilter && ponds.some((p) => p.id === pondFilter) ? pondFilter : null
      const pondIds = selectedPondId ? [selectedPondId] : ponds.map((p) => p.id)
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
          let recordsQuery = supabase
            .from('production_records')
            .select('*', { count: 'exact' })
            .in('batch_id', batchIds)
            .order('record_date', { ascending: false })
            .order('created_at', { ascending: false })

          if (fromDateFilter) {
            recordsQuery = recordsQuery.gte('record_date', fromDateFilter)
          }

          if (toDateFilter) {
            recordsQuery = recordsQuery.lte('record_date', toDateFilter)
          }

          const from = (currentPage - 1) * pageSize
          const to = from + pageSize - 1
          const { data: recs, count } = await recordsQuery.range(from, to)

          records = (recs as typeof records) ?? []
          totalRecords = count ?? 0
        }
      }
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const hasPrevPage = safeCurrentPage > 1
  const hasNextPage = safeCurrentPage < totalPages
  const startItem = totalRecords === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1
  const endItem = totalRecords === 0 ? 0 : startItem + records.length - 1
  const activePondFilter =
    pondFilter && ponds.some((pond) => pond.id === pondFilter) ? pondFilter : undefined

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams()
    if (activePondFilter) params.set('pond', activePondFilter)
    if (fromDateFilter) params.set('from', fromDateFilter)
    if (toDateFilter) params.set('to', toDateFilter)
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `/dashboard/records?${query}` : '/dashboard/records'
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
      <Card>
        <CardContent className="pt-6">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[220px] flex-col gap-1">
              <label htmlFor="pond" className="text-sm font-medium text-foreground">
                Estanque
              </label>
              <select
                id="pond"
                name="pond"
                defaultValue={pondFilter && ponds.some((pond) => pond.id === pondFilter) ? pondFilter : 'all'}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">Todos</option>
                {ponds.map((pond) => (
                  <option key={pond.id} value={pond.id}>
                    {pond.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[180px] flex-col gap-1">
              <label htmlFor="from" className="text-sm font-medium text-foreground">
                Desde
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={fromDateFilter ?? ''}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex min-w-[180px] flex-col gap-1">
              <label htmlFor="to" className="text-sm font-medium text-foreground">
                Hasta
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={toDateFilter ?? ''}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Filtrar
            </button>
            <a
              href="/dashboard/records"
              className="rounded-md border border-input px-3 py-2 text-sm font-medium text-foreground"
            >
              Limpiar
            </a>
          </form>
        </CardContent>
      </Card>

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
              {totalRecords} registros
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
                    <TableCell className="text-right">
                      {rec.avg_weight_kg != null ? (rec.avg_weight_kg * 1000).toFixed(1) : '-'}
                    </TableCell>
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {startItem}-{endItem} de {totalRecords}
              </p>
              <div className="flex items-center gap-2">
                {hasPrevPage ? (
                  <a
                    href={buildPageHref(safeCurrentPage - 1)}
                    className="rounded-md border border-input px-3 py-2 text-sm font-medium text-foreground"
                  >
                    Anterior
                  </a>
                ) : (
                  <span className="rounded-md border border-input px-3 py-2 text-sm font-medium text-muted-foreground">
                    Anterior
                  </span>
                )}
                <span className="text-sm text-muted-foreground">
                  Pagina {safeCurrentPage} de {totalPages}
                </span>
                {hasNextPage ? (
                  <a
                    href={buildPageHref(safeCurrentPage + 1)}
                    className="rounded-md border border-input px-3 py-2 text-sm font-medium text-foreground"
                  >
                    Siguiente
                  </a>
                ) : (
                  <span className="rounded-md border border-input px-3 py-2 text-sm font-medium text-muted-foreground">
                    Siguiente
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
