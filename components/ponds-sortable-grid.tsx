'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Calendar,
  CheckCircle2,
  Droplets,
  Fish,
  FlaskConical,
  GripVertical,
  Waves,
  Wind,
} from 'lucide-react'
import { format } from 'date-fns'
import { updatePondOrder } from '@/app/dashboard/ponds/actions'

import { BatchFinancialConfig } from '@/components/batch-financial-config'
import { BatchForm } from '@/components/batch-form'
import { CloseBatchButton, DeletePondButton } from '@/components/pond-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type PondListItem = {
  id: string
  name: string
  area_m2: number | null
  depth_m: number | null
  species: string | null
  status: string
  created_at: string
  batches: Array<{
    id: string
    start_date: string
    end_date: string | null
    initial_population: number
    current_population: number | null
    status: string
    sale_price_per_kg: number | null
    target_profitability_pct: number | null
    fingerling_cost_per_unit: number | null
    avg_weight_at_seeding_g: number | null
    labor_cost_per_month: number | null
  }>
}

type WaterQuality = {
  ammonia: number | null
  oxygen: number | null
  date: string
}

type WaterStatus = 'critical' | 'warning' | 'normal' | null

type PondsSortableGridProps = {
  ponds: PondListItem[]
  waterQuality: Record<string, WaterQuality>
}

function getAmmoniaStatus(val: number | null): { label: string; level: WaterStatus } | null {
  if (val == null) return null
  if (val > 1.5) return { label: 'Crítico', level: 'critical' }
  if (val > 0.5) return { label: 'Alerta', level: 'warning' }
  return { label: 'Normal', level: 'normal' }
}

function getOxygenStatus(val: number | null): { label: string; level: WaterStatus } | null {
  if (val == null) return null
  if (val < 2) return { label: 'Crítico', level: 'critical' }
  if (val < 4) return { label: 'Bajo', level: 'warning' }
  return { label: 'Normal', level: 'normal' }
}

function getPondAlertLevel(pondId: string, waterQuality: Record<string, WaterQuality>): WaterStatus {
  const wq = waterQuality[pondId]
  if (!wq) return null
  const aStatus = getAmmoniaStatus(wq.ammonia)
  const oStatus = getOxygenStatus(wq.oxygen)
  const levels: WaterStatus[] = [aStatus?.level ?? null, oStatus?.level ?? null]
  if (levels.includes('critical')) return 'critical'
  if (levels.includes('warning')) return 'warning'
  if (levels.includes('normal')) return 'normal'
  return null
}

const statusBorderClass: Record<NonNullable<WaterStatus>, string> = {
  critical: 'border-l-4 border-l-destructive',
  warning: 'border-l-4 border-l-amber-500',
  normal: 'border-l-4 border-l-primary',
}

const statusDotClass: Record<NonNullable<WaterStatus>, string> = {
  critical: 'bg-destructive',
  warning: 'bg-amber-500',
  normal: 'bg-emerald-500',
}

const statusBadgeClass: Record<NonNullable<WaterStatus>, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
  warning: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  normal: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
}


function SortablePondCard({
  pond,
  waterQuality,
}: {
  pond: PondListItem
  waterQuality: Record<string, WaterQuality>
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pond.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const activeBatches = pond.batches?.filter((batch) => batch.status === 'active') ?? []
  const wq = waterQuality[pond.id]
  const ammoniaStatus = wq ? getAmmoniaStatus(wq.ammonia) : null
  const oxygenStatus = wq ? getOxygenStatus(wq.oxygen) : null
  const alertLevel = getPondAlertLevel(pond.id, waterQuality)

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={[
        'flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md',
        isDragging ? 'opacity-60 shadow-lg ring-2 ring-primary/30' : '',
        alertLevel ? statusBorderClass[alertLevel] : '',
      ].join(' ')}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={`Reordenar ${pond.name}`}
            title="Arrastrar para reordenar"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Waves className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold text-foreground">{pond.name}</CardTitle>
            {alertLevel && (
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDotClass[alertLevel]}`} />
                <span className="text-xs text-muted-foreground">
                  {alertLevel === 'critical' ? 'Calidad crítica' : alertLevel === 'warning' ? 'En alerta' : 'Agua óptima'}
                </span>
              </div>
            )}
          </div>
        </div>
        <DeletePondButton pondId={pond.id} />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {pond.species && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Fish className="h-3 w-3" />
              {pond.species}
            </Badge>
          )}
          {pond.area_m2 && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {pond.area_m2} m²
            </Badge>
          )}
          {pond.depth_m && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {pond.depth_m} m prof.
            </Badge>
          )}
        </div>

        {wq && (wq.ammonia != null || wq.oxygen != null) && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Droplets className="h-3.5 w-3.5" />
                Calidad de agua
              </div>
              <span className="text-[10px] text-muted-foreground">{format(new Date(wq.date), 'dd/MM/yy')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {wq.ammonia != null && ammoniaStatus && (
                <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${statusBadgeClass[ammoniaStatus.level!]}`}>
                  <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium opacity-70">Amoniaco</p>
                    <p className="text-xs font-semibold">{wq.ammonia} mg/L</p>
                  </div>
                </div>
              )}
              {wq.oxygen != null && oxygenStatus && (
                <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${statusBadgeClass[oxygenStatus.level!]}`}>
                  <Wind className="h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium opacity-70">Oxígeno</p>
                    <p className="text-xs font-semibold">{wq.oxygen} mg/L</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeBatches.length > 0 && !wq && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <Droplets className="h-3.5 w-3.5 shrink-0" />
            Sin datos de calidad de agua recientes
          </div>
        )}

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Lotes</p>
              {activeBatches.length > 0 && (
                <Badge className="h-4 px-1.5 text-[10px]">
                  {activeBatches.length} activo{activeBatches.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <BatchForm pondId={pond.id} />
          </div>

          {pond.batches && pond.batches.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {pond.batches.map((batch) => (
                <div
                  key={batch.id}
                  className="group flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 transition-colors duration-150 hover:bg-muted/70"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {batch.status === 'active' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40" />
                      )}
                      <span className="text-xs font-medium text-foreground">
                        {(batch.current_population ?? batch.initial_population).toLocaleString()} peces
                      </span>
                      {batch.status !== 'active' && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          Cerrado
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Inicio: {format(new Date(batch.start_date), 'dd/MM/yyyy')}
                      {batch.end_date && <span className="ml-1">· Fin: {format(new Date(batch.end_date), 'dd/MM/yyyy')}</span>}
                    </div>
                  </div>
                  {batch.status === 'active' && (
                    <div className="flex shrink-0 items-center gap-1">
                      <BatchFinancialConfig
                        batchId={batch.id}
                        initialPopulation={batch.initial_population}
                        current={{
                          sale_price_per_kg: batch.sale_price_per_kg,
                          target_profitability_pct: batch.target_profitability_pct,
                          fingerling_cost_per_unit: batch.fingerling_cost_per_unit,
                          avg_weight_at_seeding_g: batch.avg_weight_at_seeding_g,
                          labor_cost_per_month: batch.labor_cost_per_month,
                        }}
                      />
                      <CloseBatchButton batchId={batch.id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-4 text-xs text-muted-foreground">
              Sin lotes registrados
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function PondsSortableGrid({ ponds, waterQuality }: PondsSortableGridProps) {
  const pondIds = useMemo(() => ponds.map((pond) => pond.id), [ponds])
  const pondsMap = useMemo(() => new Map(ponds.map((pond) => [pond.id, pond])), [ponds])

  const [order, setOrder] = useState<string[]>(pondIds)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    setOrder(pondIds)
  }, [pondIds])

  const sortedPonds = useMemo(() => {
    const byOrder = order.map((id) => pondsMap.get(id)).filter((pond): pond is PondListItem => Boolean(pond))
    const missing = ponds.filter((pond) => !order.includes(pond.id))
    return [...byOrder, ...missing]
  }, [order, pondsMap, ponds])

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    let updatedOrder: string[] | null = null
    setOrder((currentOrder) => {
      const oldIndex = currentOrder.indexOf(String(active.id))
      const newIndex = currentOrder.indexOf(String(over.id))
      if (oldIndex < 0 || newIndex < 0) return currentOrder
      updatedOrder = arrayMove(currentOrder, oldIndex, newIndex)
      return updatedOrder
    })

    if (!updatedOrder) return

    try {
      await updatePondOrder(updatedOrder)
    } catch (error) {
      console.error('No se pudo guardar el orden de estanques', error)
      setOrder(pondIds)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">Arrastra desde el ícono lateral para reordenar los estanques. El orden se mantiene en toda la plataforma.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedPonds.map((pond) => pond.id)}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedPonds.map((pond) => (
              <SortablePondCard key={pond.id} pond={pond} waterQuality={waterQuality} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
