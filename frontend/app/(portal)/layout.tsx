import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ProducerSidebar } from '@/components/portal/producer-sidebar'

export default async function PortalLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = createClient(await cookies())
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  // Si un admin intenta entrar al portal de cliente, redirigir al admin panel
  if (profile?.role && profile.role !== 'cliente') {
    redirect('/admin/dashboard')
  }

  return (
    <SidebarProvider>
      <ProducerSidebar user={{ email: user.email!, ...profile }} />
      <SidebarInset className="bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,_rgba(245,251,247,1),_rgba(255,247,237,0.72))]">
        <div className="sticky top-0 z-20 border-b border-primary/10 bg-background/80 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="md:hidden" />
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-primary/70">Workspace operativo</p>
                <p className="text-sm font-semibold text-foreground">Portal del productor</p>
              </div>
            </div>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profile?.full_name || user.email}
            </span>
          </div>
        </div>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
