'use client'

import type { CaseSeverity } from '@/lib/api/cases'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCaseSeverityLabel } from '@/lib/api/cases'

const SEVERITY_OPTIONS: CaseSeverity[] = ['low', 'medium', 'high', 'critical']

interface SeveritySelectorProps {
  disabled?: boolean
  value: CaseSeverity
  onValueChange: (value: CaseSeverity) => void
}

export function SeveritySelector({
  disabled,
  value,
  onValueChange,
}: SeveritySelectorProps) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue: CaseSeverity) => onValueChange(nextValue)}
      disabled={disabled}
    >
      <SelectTrigger id="severity">
        <SelectValue placeholder="Selecciona la severidad" />
      </SelectTrigger>
      <SelectContent>
        {SEVERITY_OPTIONS.map((severity) => (
          <SelectItem key={severity} value={severity}>
            {getCaseSeverityLabel(severity)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
