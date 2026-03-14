import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

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

  const navigation = [
    { href: '/portal/dashboard', label: 'Resumen' },
    { href: '/portal/my-cases', label: 'Mis casos' },
    { href: '/portal/my-farm', label: 'Mi granja' },
  ]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,_rgba(245,251,247,1),_rgba(255,247,237,0.72))]">
      <header className="border-b border-primary/10 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
              N
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-primary/70">Portal productor</p>
              <span className="font-semibold text-foreground">Norgtech</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              {navigation.map((item) => (
                <Button key={item.href} asChild variant="ghost" className="rounded-full px-4 text-sm">
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
