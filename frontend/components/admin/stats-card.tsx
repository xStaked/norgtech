import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface StatsCardProps {
  eyebrow: string
  value: string
  label: string
  description: string
  icon: ReactNode
  accentClassName?: string
}

export function StatsCard({
  eyebrow,
  value,
  label,
  description,
  icon,
  accentClassName = 'border-primary/15 bg-primary/5',
}: StatsCardProps) {
  return (
    <Card className={`overflow-hidden border-0 shadow-none ${accentClassName}`}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
              {eyebrow}
            </p>
            <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          </div>
          <div className="rounded-2xl border border-background/70 bg-background/80 p-3 text-foreground shadow-sm">
            {icon}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}
