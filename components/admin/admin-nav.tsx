'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { BarChart3, FlaskConical, ShieldCheck, Users } from 'lucide-react'

const items = [
  { href: '/admin', label: 'Resumen', icon: ShieldCheck },
  { href: '/admin/producers', label: 'Productores', icon: Users },
  { href: '/admin/bioremediation', label: 'Bioremediacion', icon: FlaskConical },
  { href: '/admin/analytics', label: 'Analiticas', icon: BarChart3 },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="mt-4 overflow-x-auto">
      <ul className="flex min-w-max gap-2">
        {items.map((item) => {
          const active = item.href === '/admin' ? pathname === item.href : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
