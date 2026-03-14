'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  MapPin,
  Calculator,
  BookOpen,
  Bot,
  Settings,
  LogOut,
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
} from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  {
    group: 'Principal',
    items: [
      { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
      { label: 'Productores', href: '/admin/clients', icon: Users },
      { label: 'Granjas', href: '/admin/farms', icon: Building2 },
    ],
  },
  {
    group: 'Soporte Técnico',
    items: [
      { label: 'Casos', href: '/admin/cases', icon: FileText },
      { label: 'Visitas', href: '/admin/visits', icon: MapPin },
    ],
  },
  {
    group: 'Herramientas',
    items: [
      { label: 'Calculadoras', href: '/admin/calculators/roi', icon: Calculator },
      { label: 'Base de Conocimiento', href: '/admin/knowledge', icon: BookOpen },
      { label: 'Asistente AI', href: '/admin/assistant', icon: Bot },
    ],
  },
]

interface AdminSidebarProps {
  user: {
    email: string
    full_name?: string
    role?: string
    organization_id?: string
  }
}

export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
            <span className="text-sidebar-primary-foreground font-bold text-sm">N</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sidebar-foreground text-sm leading-tight">Norgtech</span>
            <span className="text-xs text-sidebar-foreground/60 truncate">
              {user.role?.replace('_', ' ')}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_ITEMS.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname.startsWith(item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href}>
                          <Icon className="size-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/admin/settings">
                <Settings className="size-4" />
                <span>Configuración</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="text-destructive hover:text-destructive">
              <LogOut className="size-4" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 py-1">
          <p className="text-xs text-sidebar-foreground/50 truncate">{user.email}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
