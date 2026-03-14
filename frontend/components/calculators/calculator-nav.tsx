'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/admin/calculators/fca', label: 'FCA' },
  { href: '/admin/calculators/roi', label: 'ROI' },
  { href: '/admin/calculators/production-sim', label: 'Simulador' },
]

export function CalculatorNav() {
  const pathname = usePathname()

  return (
    <div className="inline-flex flex-wrap rounded-full border border-primary/15 bg-white/80 p-1 shadow-sm">
      {ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
