'use client'

import React from "react"

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Fish, Waves } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error

      const userId = authData.user?.id
      if (!userId) throw new Error('No se pudo obtener el usuario autenticado')

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      router.replace(profile?.role === 'admin' ? '/admin' : '/dashboard')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Ocurrio un error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background p-6 md:p-10">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2.5 text-primary">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Fish className="h-6 w-6" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-foreground">AquaData</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Waves className="h-4 w-4" />
              <p className="text-sm">Plataforma Acuicola Digital</p>
            </div>
          </div>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl text-foreground">Iniciar Sesion</CardTitle>
              <CardDescription>
                Ingresa tu email y contrasena para acceder
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="operario@granja.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Contrasena</Label>
                      <Link
                        href="/auth/forgot-password"
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-primary"
                      >
                        Olvidaste tu contrasena?
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Ingresando...' : 'Ingresar'}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  {'No tienes cuenta? '}
                  <Link
                    href="/auth/sign-up"
                    className="text-primary underline underline-offset-4"
                  >
                    Registrate
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
