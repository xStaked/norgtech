import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell, AlertTriangle, AlertOctagon, CheckCircle, FlaskConical, Calculator } from 'lucide-react'
import { AlertActions } from '@/components/alert-actions'

const OPPORTUNITY_TYPES = [
  'high_ammonia',
  'high_nitrite',
  'high_phosphate',
  'high_ph',
  'low_ph',
  'ph_ammonia_mortality',
  'nitrite_ph_mortality',
]

export default async function AlertsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  let alerts: Array<{
    id: string
    alert_type: string
    severity: string
    message: string
    is_read: boolean
    created_at: string
    pond_id: string | null
  }> = []

  let pondNames: Record<string, string> = {}

  if (profile?.organization_id) {
    const [{ data }, { data: ponds }] = await Promise.all([
      supabase
        .from('alerts')
        .select('id, alert_type, severity, message, is_read, created_at, pond_id')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('ponds')
        .select('id, name')
        .eq('organization_id', profile.organization_id)
        .order('sort_order', { ascending: true })
        .order('name'),
    ])

    alerts = (data ?? []) as typeof alerts

    if (ponds) {
      for (const p of ponds) {
        pondNames[p.id] = p.name
      }
    }
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length
  const opportunityCount = alerts.filter((a) => !a.is_read && OPPORTUNITY_TYPES.includes(a.alert_type)).length

  const severityConfig: Record<string, { icon: typeof AlertTriangle; badgeClass: string; label: string }> = {
    critical: { icon: AlertOctagon, badgeClass: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Critico' },
    warning: { icon: AlertTriangle, badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/20', label: 'Advertencia' },
    info: { icon: Bell, badgeClass: 'bg-primary/10 text-primary border-primary/20', label: 'Info' },
  }

  const typeLabels: Record<string, string> = {
    low_oxygen: 'Oxigeno bajo',
    high_ammonia: 'Amonio alto',
    high_ph: 'pH alto',
    low_ph: 'pH bajo',
    high_temperature: 'Temperatura alta',
    low_temperature: 'Temperatura baja',
    high_nitrite: 'Nitrito alto',
    high_nitrate: 'Nitrato alto',
    low_hardness: 'Dureza baja',
    high_hardness: 'Dureza alta',
    low_alkalinity: 'Alcalinidad baja',
    high_alkalinity: 'Alcalinidad alta',
    high_phosphate: 'Fosfato alto',
    ph_ammonia_mortality: 'Mortalidad (pH + Amonio)',
    nitrite_ph_mortality: 'Mortalidad (Nitrito + pH)',
    high_mortality: 'Mortalidad alta',
    high_fca: 'FCA elevado',
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Alertas</h1>
          <p className="mt-1 text-muted-foreground">
            {unreadCount > 0
              ? `${unreadCount} alerta${unreadCount > 1 ? 's' : ''} sin leer`
              : 'Todas las alertas leidas'}
            {opportunityCount > 0 && ` · ${opportunityCount} oportunidad${opportunityCount > 1 ? 'es' : ''} de tratamiento`}
          </p>
        </div>
        {unreadCount > 0 && <AlertActions />}
      </div>

      {alerts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CheckCircle className="h-10 w-10 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Sin alertas</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Las alertas se generan automaticamente cuando se detectan valores fuera de rango en los registros productivos.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => {
            const config = severityConfig[alert.severity] ?? severityConfig.info
            const Icon = config.icon
            const isOpportunity = OPPORTUNITY_TYPES.includes(alert.alert_type)
            const formattedDate = new Date(alert.created_at).toLocaleDateString('es', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })

            return (
              <Card
                key={alert.id}
                className={`transition-shadow duration-200 hover:shadow-md ${alert.is_read ? 'opacity-60' : ''}`}
              >
                <CardContent className="flex items-start gap-4 py-4">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    isOpportunity
                      ? 'bg-primary/10'
                      : alert.severity === 'critical'
                      ? 'bg-destructive/10'
                      : 'bg-amber-500/10'
                  }`}>
                    {isOpportunity ? (
                      <FlaskConical className="h-5 w-5 text-primary" />
                    ) : (
                      <Icon className={`h-5 w-5 ${alert.severity === 'critical' ? 'text-destructive' : 'text-amber-600'}`} />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={config.badgeClass}>
                        {config.label}
                      </Badge>
                      <Badge variant="secondary">
                        {typeLabels[alert.alert_type] ?? alert.alert_type}
                      </Badge>
                      {alert.pond_id && pondNames[alert.pond_id] && (
                        <Badge variant="secondary">{pondNames[alert.pond_id]}</Badge>
                      )}
                      {isOpportunity && !alert.is_read && (
                        <Badge variant="outline" className="border-primary/30 text-primary">
                          Oportunidad
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-foreground">{alert.message}</p>
                    <div className="mt-1 flex items-center gap-3">
                      <p className="text-xs text-muted-foreground">{formattedDate}</p>
                      {isOpportunity && !alert.is_read && (
                        <a
                          href="/dashboard/bioremediation"
                          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Calculator className="h-3 w-3" />
                          Calcular tratamiento
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
