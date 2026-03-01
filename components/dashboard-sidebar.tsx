'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Fish,
  LayoutDashboard,
  Waves,
  Camera,
  ClipboardList,
  Calculator,
  BarChart3,
  DollarSign,
  Bell,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { href: '/dashboard/ponds', label: 'Estanques', icon: Waves },
  { href: '/dashboard/upload', label: 'Nuevo Reporte', icon: Camera },
  { href: '/dashboard/records', label: 'Registros', icon: ClipboardList },
  { href: '/dashboard/analytics', label: 'Analitica', icon: BarChart3 },
  { href: '/dashboard/costs', label: 'Ventas', icon: DollarSign },
  { href: '/dashboard/alerts', label: 'Alertas', icon: Bell },
  { href: '/dashboard/bioremediation', label: 'Bioremediacion', icon: Calculator },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary/15">
          <Fish className="h-5 w-5 text-sidebar-primary" />
        </div>
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
          AquaData
        </span>
      </div>

      <nav className="flex-1 px-3 py-2">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                    active
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border px-3 py-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesion
        </Button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-card text-foreground shadow-md lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Abrir menu"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          onKeyDown={() => { }}
          role="presentation"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
