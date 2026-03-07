import React from 'react'
import Link from 'next/link'
import { ShieldCheck, ArrowLeft } from 'lucide-react'
import { requireAdminUser } from '@/lib/auth/roles'
import { AdminNav } from '@/components/admin/admin-nav'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile } = await requireAdminUser()

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-foreground lg:text-lg">AquaData Admin</h1>
                <p className="text-xs text-muted-foreground">{profile?.full_name || 'Administrador'}</p>
              </div>
            </div>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              Ir a Dashboard
            </Link>
          </div>
          <AdminNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}
