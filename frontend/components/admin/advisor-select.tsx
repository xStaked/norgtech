'use client'

import type { AdvisorOption } from '@/lib/admin/advisors'
import { getAdvisorDisplayName, getAdvisorRoleLabel } from '@/lib/admin/advisors'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const UNASSIGNED_VALUE = '__unassigned__'

interface AdvisorSelectProps {
  advisors: AdvisorOption[]
  disabled?: boolean
  placeholder?: string
  value?: string
  onValueChange: (value: string) => void
}

export function AdvisorSelect({
  advisors,
  disabled,
  placeholder = 'Selecciona un asesor',
  value,
  onValueChange,
}: AdvisorSelectProps) {
  return (
    <Select
      value={value || UNASSIGNED_VALUE}
      onValueChange={(nextValue) =>
        onValueChange(nextValue === UNASSIGNED_VALUE ? '' : nextValue)
      }
      disabled={disabled}
    >
      <SelectTrigger id="assignedAdvisorId">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED_VALUE}>Sin asignar</SelectItem>
        {advisors.map((advisor) => (
          <SelectItem key={advisor.id} value={advisor.id}>
            {getAdvisorDisplayName(advisor)} · {getAdvisorRoleLabel(advisor.role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
