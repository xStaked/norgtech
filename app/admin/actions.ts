'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/auth/roles'

function randomCode() {
  const tail = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `AQUA-${tail}`
}

export async function createInvitationCode(formData: FormData) {
  const { supabase } = await requireAdminUser()

  const rawCode = (formData.get('code') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim()

  const code = (rawCode || randomCode()).toUpperCase()

  const { error } = await supabase.from('invitation_codes').insert({
    code,
    description: description || null,
    used: false,
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/admin')
}
