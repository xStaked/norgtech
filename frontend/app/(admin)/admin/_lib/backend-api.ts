import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export async function getAccessToken() {
  const supabase = createClient(await cookies())
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    redirect('/auth/login')
  }

  return session.access_token
}

export async function fetchBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken()
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error inesperado en la API.' }))
    throw new Error(error.message || `Error ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function toQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    searchParams.set(key, String(value))
  })

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}
