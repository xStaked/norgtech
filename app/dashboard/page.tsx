import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Waves,
  Fish,
  Scale,
  Camera,
  ClipboardList,
  Calculator,
  BarChart3,
  DollarSign,
  Bell,
  AlertTriangle,
  Droplets,
  ArrowRight,
  Activity,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, organization_id')
    .eq('id', user!.id)
    .single()

  let pondCount = 0
  let batchCount = 0
  let recordCount = 0
  let unreadAlerts: Array<{ id: string; severity: string; message: string; alert_type: string; created_at: string }> = []

  if (profile?.organization_id) {
    // Parallel: counts + alerts
    const [{ count: ponds }, { data: orgPonds }, { data: alertData }] = await Promise.all([
      supabase
        .from('ponds')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', profile.organization_id),
      supabase
        .from('ponds')
        .select('id')
        .eq('organization_id', profile.organization_id),
      supabase
        .from('alerts')
        .select('id, severity, message, alert_type, created_at')
        .eq('organization_id', profile.organization_id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    pondCount = ponds ?? 0
    unreadAlerts = (alertData ?? []) as typeof unreadAlerts

    if (orgPonds && orgPonds.length > 0) {
      const pondIds = orgPonds.map(p => p.id)
      const [{ count: batches }, { data: allBatches }] = await Promise.all([
        supabase
          .from('batches')
          .select('*', { count: 'exact', head: true })
          .in('pond_id', pondIds)
          .eq('status', 'active'),
        supabase
          .from('batches')
          .select('id')
          .in('pond_id', pondIds),
      ])

      batchCount = batches ?? 0

      if (allBatches && allBatches.length > 0) {
        const batchIds = allBatches.map(b => b.id)
        const { count: records } = await supabase
          .from('production_records')
          .select('*', { count: 'exact', head: true })
          .in('batch_id', batchIds)
        recordCount = records ?? 0
      }
    }
  }

  const greeting = profile?.full_name
    ? `Hola, ${profile.full_name}`
    : 'Bienvenido'

  const opportunityTypes = ['high_ammonia', 'low_oxygen']
  const opportunities = unreadAlerts.filter(a => opportunityTypes.includes(a.alert_type))
  const otherAlerts = unreadAlerts.filter(a => !opportunityTypes.includes(a.alert_type))
  const totalUnreadAlerts = unreadAlerts.length
  const attentionLevel = totalUnreadAlerts > 5 ? 'Alta prioridad' : totalUnreadAlerts > 0 ? 'Seguimiento activo' : 'Operacion estable'
  const attentionTone = totalUnreadAlerts > 5
    ? 'text-destructive'
    : totalUnreadAlerts > 0
      ? 'text-amber-700'
      : 'text-emerald-700'
  const readinessScore = Math.max(0, 100 - (otherAlerts.length * 12 + opportunities.length * 8))

  const kpis = [
    {
      title: 'Estanques',
      value: pondCount,
      description: 'Registrados',
      icon: Waves,
      tone: 'from-[#234085]/10 to-transparent',
    },
    {
      title: 'Lotes Activos',
      value: batchCount,
      description: 'En produccion',
      icon: Fish,
      tone: 'from-[#2AA6D1]/12 to-transparent',
    },
    {
      title: 'Registros',
      value: recordCount,
      description: 'Datos capturados',
      icon: Scale,
      tone: 'from-[#234085]/8 to-transparent',
    },
    {
      title: 'Alertas abiertas',
      value: totalUnreadAlerts,
      description: totalUnreadAlerts === 0 ? 'Sin pendientes' : 'Requieren revision',
      icon: Bell,
      tone: 'from-[#234085]/8 to-transparent',
    },
  ]

  const quickActions = [
    { label: 'Calcular dosis', href: '/dashboard/bioremediation', Icon: Calculator, desc: 'Bioremediacion por estanque' },
    { label: 'Registrar ventas', href: '/dashboard/costs', Icon: DollarSign, desc: 'Costos, cosechas e ingresos' },
    { label: 'Subir reporte', href: '/dashboard/upload', Icon: Camera, desc: 'Foto a datos con IA' },
    { label: 'Ver analitica', href: '/dashboard/analytics', Icon: BarChart3, desc: 'Tendencias y desempeno' },
    { label: 'Gestionar estanques', href: '/dashboard/ponds', Icon: Waves, desc: 'Estado y configuracion' },
    { label: 'Abrir registros', href: '/dashboard/records', Icon: ClipboardList, desc: 'Historial operativo' },
  ]

  const overviewItems = [
    {
      label: 'Capacidad monitoreada',
      value: `${pondCount} estanques`,
      helper: pondCount > 0 ? 'Base operativa disponible' : 'Aun sin configuracion',
      icon: Waves,
    },
    {
      label: 'Ciclos en marcha',
      value: `${batchCount} lotes`,
      helper: batchCount > 0 ? 'Produccion activa' : 'Sin lotes activos',
      icon: Fish,
    },
    {
      label: 'Disciplina de captura',
      value: `${recordCount} registros`,
      helper: recordCount > 0 ? 'Trazabilidad acumulada' : 'Sin datos recientes',
      icon: ClipboardList,
    },
  ]

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-[28px] border border-[#234085]/10 bg-[linear-gradient(180deg,#ffffff_0%,#f6f8fb_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(35,64,133,0.28)] lg:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#234085] via-[#2AA6D1] to-[#234085]" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_360px]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="rounded-full border border-[#234085]/10 bg-[#234085]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#234085] shadow-none hover:bg-[#234085]/5">
                Centro de control
              </Badge>
              <span className={`text-sm font-medium ${attentionTone}`}>
                {attentionLevel}
              </span>
            </div>

            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl lg:text-5xl">
                {greeting}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Vista consolidada de la operacion acuicola: estado productivo, alertas activas
                y accesos rapidos para que el panel se sienta como un dashboard de trabajo,
                no como una pagina de enlaces.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Salud operativa
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-slate-950">{readinessScore}%</span>
                  <span className="pb-1 text-xs text-slate-500">indice estimado</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Focos de accion
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-slate-950">{opportunities.length}</span>
                  <span className="pb-1 text-xs text-slate-500">tratamientos sugeridos</span>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Alertas abiertas
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-slate-950">{totalUnreadAlerts}</span>
                  <span className="pb-1 text-xs text-slate-500">pendientes por revisar</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/analytics"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#234085] px-4 py-3 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-0.5"
              >
                Abrir analitica
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard/upload"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
              >
                Cargar reporte
                <Camera className="h-4 w-4 text-[#234085]" />
              </Link>
            </div>
          </div>

          <Card className="border-[#234085]/10 bg-[#f8fbfe] shadow-none">
            <CardHeader className="space-y-3 pb-4">
              <div className="flex items-center justify-between">
                <Badge className="border-[#234085]/10 bg-white text-[#234085] hover:bg-white">
                  Resumen ejecutivo
                </Badge>
                <Sparkles className="h-4 w-4 text-[#2AA6D1]" />
              </div>
              <CardTitle className="text-xl tracking-tight text-slate-950">
                Estado del panel hoy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-[#234085]/10 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Prioridad actual
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{attentionLevel}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#234085]/6">
                    <Activity className="h-5 w-5 text-[#2AA6D1]" />
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {totalUnreadAlerts > 0
                    ? `Hay ${totalUnreadAlerts} alertas sin leer y ${opportunities.length} posibles tratamientos por priorizar.`
                    : 'No hay alertas pendientes. La operacion se ve ordenada y sin fricciones visibles.'}
                </p>
              </div>

              <div className="space-y-3">
                {overviewItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#234085]/6">
                        <Icon className="h-4 w-4 text-[#2AA6D1]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-950">{item.value}</p>
                        <p className="text-xs text-slate-500">{item.label} · {item.helper}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <Link
                href="/dashboard/alerts"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#234085] hover:text-[#2AA6D1]"
              >
                Ir al centro de alertas
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card
              key={kpi.title}
              className={`relative overflow-hidden border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}
            >
              <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${kpi.tone}`} />
              <CardHeader className="relative flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">
                  {kpi.title}
                </CardTitle>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#234085]/6 ring-1 ring-[#234085]/10">
                  <Icon className="h-5 w-5 text-[#2AA6D1]" />
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="text-3xl font-bold tracking-tight text-slate-950">{kpi.value}</div>
                <p className="mt-1 text-xs text-slate-500">{kpi.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
        <div className="space-y-6">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Requiere atencion
                </p>
                <CardTitle className="mt-2 text-xl tracking-tight text-slate-950">
                  Prioridades operativas
                </CardTitle>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#234085]/6">
                <ShieldAlert className="h-5 w-5 text-[#2AA6D1]" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {opportunities.length > 0 ? (
                <div className="grid gap-3">
                  {opportunities.slice(0, 4).map((alert) => (
                    <div
                      key={alert.id}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
                        <Droplets className="h-4 w-4 text-[#2AA6D1]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-slate-950">Tratamiento recomendado</p>
                          <Badge variant="outline" className="border-[#234085]/10 bg-white text-[#234085]">
                            Oportunidad
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#21A150]/20 bg-[#21A150]/[0.08] p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
                      <CheckCircle2 className="h-5 w-5 text-[#21A150]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Sin tratamientos urgentes</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        No hay alertas de calidad de agua que apunten a una intervencion inmediata.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/bioremediation"
                  className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                >
                  Calcular dosis
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/dashboard/alerts"
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
                >
                  Ver alertas
                  <Bell className="h-4 w-4 text-[#2AA6D1]" />
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Navegacion operativa
              </p>
              <CardTitle className="mt-2 text-xl tracking-tight text-slate-950">
                Acciones rapidas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {quickActions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:-translate-y-1 hover:border-[#2AA6D1]/30 hover:bg-slate-50"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#234085]/6 transition-colors duration-200 group-hover:bg-[#234085]">
                      <action.Icon className="h-5 w-5 text-[#2AA6D1] transition-colors duration-200 group-hover:text-white" />
                    </div>
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-slate-950">{action.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{action.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    Centro de alertas
                  </p>
                  <CardTitle className="mt-2 text-xl tracking-tight text-slate-950">
                    Seguimiento inmediato
                  </CardTitle>
                </div>
                <Badge variant="secondary" className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                  {otherAlerts.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {otherAlerts.length > 0 ? (
                otherAlerts.slice(0, 4).map((alert) => (
                  <div key={alert.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${alert.severity === 'critical' ? 'text-destructive' : 'text-[#2AA6D1]'}`} />
                      <div>
                        <p className="text-sm font-medium text-slate-950">
                          {alert.severity === 'critical' ? 'Critica' : 'Advertencia'}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{alert.message}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-600">
                    No hay otras alertas activas fuera de calidad de agua.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Panorama de operacion
              </p>
              <CardTitle className="mt-2 text-xl tracking-tight text-slate-950">
                Orden del sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {overviewItems.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
                      <Icon className="h-4 w-4 text-[#2AA6D1]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-950">{item.label}</p>
                      <p className="text-xs text-slate-500">
                        {item.value} · {item.helper}
                      </p>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {!profile?.organization_id && (
            <Card className="border-dashed border-slate-200 bg-white shadow-sm">
              <CardContent className="flex flex-col gap-4 py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#234085]/6">
                  <Fish className="h-6 w-6 text-[#2AA6D1]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">Comienza configurando tu granja</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Crea tu primera granja y estanque para desbloquear lotes, reportes fotograficos,
                    alertas y KPIs con sentido operativo.
                  </p>
                </div>
                <Link
                  href="/dashboard/ponds"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#234085] hover:text-[#2AA6D1]"
                >
                  Ir a estanques
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}
