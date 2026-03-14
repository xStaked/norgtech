'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  Bell,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
  Tractor,
  Waypoints,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/client'

const NAV_GROUPS = [
  {
    group: 'Vista general',
    items: [
      { label: 'Resumen', href: '/portal/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    group: 'Operación',
    items: [
      { label: 'Granjas', href: '/portal/farms', icon: Tractor },
      { label: 'Casos', href: '/portal/cases', icon: ClipboardList },
    ],
  },
  {
    group: 'Próximamente',
    items: [
      { label: 'Registros', icon: Waypoints, disabled: true },
      { label: 'Analíticas', icon: Activity, disabled: true },
      { label: 'Alertas', icon: Bell, disabled: true },
      { label: 'Calculadoras', icon: Calculator, disabled: true },
    ],
  },
] as const

const ACTIVE_MATCHERS = new Map<string, string[]>([
  ['/portal/dashboard', ['/portal/dashboard']],
  ['/portal/farms', ['/portal/farms', '/portal/my-farm']],
  ['/portal/cases', ['/portal/cases', '/portal/my-cases']],
])

interface ProducerSidebarProps {
  user: {
    email: string
    full_name?: string
    role?: string
  }
}

export function ProducerSidebar({ user }: ProducerSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground shadow-sm">
            N
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">Portal productor</p>
            <p className="truncate text-xs uppercase tracking-[0.22em] text-sidebar-foreground/60">
              Norgtech
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/40 px-3 py-2">
          <p className="truncate text-sm font-medium text-sidebar-foreground">
            {user.full_name || 'Productor'}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/65">{user.email}</p>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="py-2">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const matchers = item.href ? ACTIVE_MATCHERS.get(item.href) ?? [item.href] : []
                  const isActive = matchers.some((matcher) => pathname.startsWith(matcher))

                  return (
                    <SidebarMenuItem key={item.label}>
                      {item.href ? (
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <Link href={item.href}>
                            <Icon className="size-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton disabled tooltip={`${item.label} próximamente`}>
                          <Icon className="size-4" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled tooltip="Configuración próximamente">
              <Settings className="size-4" />
              <span>Configuración</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="text-destructive hover:text-destructive">
              <LogOut className="size-4" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
