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

export default function SignUpPage() {
  const [inviteCode, setInviteCode] = useState('')
  const [farmName, setFarmName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== repeatPassword) {
      setError('Las contraseñas no coinciden')
      setIsLoading(false)
      return
    }

    // Validate invitation code
    const { data: codeData, error: codeError } = await supabase
      .from('invitation_codes')
      .select('id, used')
      .eq('code', inviteCode.trim().toUpperCase())
      .single()

    if (codeError || !codeData) {
      setError('Código de invitación inválido')
      setIsLoading(false)
      return
    }

    if (codeData.used) {
      setError('Este código de invitación ya fue utilizado')
      setIsLoading(false)
      return
    }

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ||
            `${window.location.origin}/dashboard`,
          data: {
            full_name: fullName,
            farm_name: farmName,
          },
        },
      })
      if (signUpError) throw signUpError

      // Mark invitation code as used
      await supabase
        .from('invitation_codes')
        .update({
          used: true,
          used_by: signUpData.user?.id,
          used_at: new Date().toISOString(),
        })
        .eq('id', codeData.id)

      router.push('/auth/sign-up-success')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Ocurrio un error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background p-6 md:p-10">
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
              <CardTitle className="text-2xl text-foreground">Crear Cuenta</CardTitle>
              <CardDescription>
                Registra tu cuenta para comenzar a digitalizar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSignUp}>
                <div className="flex flex-col gap-5">
                  <div className="grid gap-2">
                    <Label htmlFor="inviteCode">Código de invitación</Label>
                    <Input
                      id="inviteCode"
                      type="text"
                      placeholder="AQUA-XXXX-XXXX"
                      required
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="farmName">Nombre de la granja</Label>
                    <Input
                      id="farmName"
                      type="text"
                      placeholder="Granja Acuicola Los Peces"
                      required
                      value={farmName}
                      onChange={(e) => setFarmName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Juan Perez"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
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
                    <Label htmlFor="password">Contrasena</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="repeat-password">Repetir contrasena</Label>
                    <Input
                      id="repeat-password"
                      type="password"
                      required
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creando cuenta...' : 'Registrarse'}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm text-muted-foreground">
                  {'Ya tienes cuenta? '}
                  <Link
                    href="/auth/login"
                    className="text-primary underline underline-offset-4"
                  >
                    Inicia sesion
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
