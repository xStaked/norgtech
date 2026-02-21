'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function SyncMarketPricesButton() {
    const [loading, setLoading] = useState(false)

    async function handleSync() {
        setLoading(true)
        try {
            const res = await fetch('/api/market-prices/sync', { method: 'POST' })
            const json = await res.json()

            if (!res.ok) {
                toast.error(`Error al sincronizar: ${json.error}`)
                return
            }

            toast.success(json.message ?? 'Precios actualizados')
            // Recargar la página para reflejar nuevos precios
            window.location.reload()
        } catch {
            toast.error('No se pudo conectar al servidor')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={loading}
            className="gap-2"
        >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Sincronizando...' : 'Actualizar precios SIPSA'}
        </Button>
    )
}
