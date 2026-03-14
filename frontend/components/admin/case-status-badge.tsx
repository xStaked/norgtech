import { AlertTriangle, ShieldCheck, Siren, Stethoscope } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getCaseSeverityLabel,
  getCaseStatusLabel,
} from '@/lib/api/cases'

interface CaseStatusBadgeProps {
  type: 'status' | 'severity'
  value: string
  className?: string
}

function getSeverityConfig(value: string) {
  if (value === 'critical') {
    return {
      label: getCaseSeverityLabel(value),
      className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50',
      Icon: Siren,
    }
  }

  if (value === 'high') {
    return {
      label: getCaseSeverityLabel(value),
      className: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50',
      Icon: AlertTriangle,
    }
  }

  if (value === 'low') {
    return {
      label: getCaseSeverityLabel(value),
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
      Icon: ShieldCheck,
    }
  }

  return {
    label: getCaseSeverityLabel(value),
    className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50',
    Icon: Stethoscope,
  }
}

function getStatusConfig(value: string) {
  if (value === 'closed') {
    return {
      label: getCaseStatusLabel(value),
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
      Icon: ShieldCheck,
    }
  }

  if (value === 'waiting_client') {
    return {
      label: getCaseStatusLabel(value),
      className: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50',
      Icon: AlertTriangle,
    }
  }

  if (value === 'treatment') {
    return {
      label: getCaseStatusLabel(value),
      className: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50',
      Icon: Stethoscope,
    }
  }

  if (value === 'in_analysis') {
    return {
      label: getCaseStatusLabel(value),
      className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50',
      Icon: AlertTriangle,
    }
  }

  return {
    label: getCaseStatusLabel(value),
    className: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50',
    Icon: Siren,
  }
}

export function CaseStatusBadge({
  type,
  value,
  className,
}: CaseStatusBadgeProps) {
  const config = type === 'severity' ? getSeverityConfig(value) : getStatusConfig(value)
  const Icon = config.Icon

  return (
    <Badge
      variant="outline"
      className={cn('gap-1.5 border font-medium', config.className, className)}
    >
      <Icon className="size-3.5" />
      {config.label}
    </Badge>
  )
}
