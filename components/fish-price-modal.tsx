'use client'

import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit2, Loader2 } from 'lucide-react'
import { updateBatchPrice } from '@/app/dashboard/ponds/actions'
import { formatCOP } from '@/lib/market-data'

interface FishPriceModalProps {
    batchId: string
    currentPrice: number | null
    species: string
}

export function FishPriceModal({ batchId, currentPrice, species }: FishPriceModalProps) {
    const [open, setOpen] = useState(false)
    const [price, setPrice] = useState(currentPrice?.toString() || '')
    const [isUpdating, setIsUpdating] = useState(false)

    const handleUpdate = async () => {
        setIsUpdating(true)
        try {
            await updateBatchPrice(batchId, Number(price))
            setOpen(false)
        } catch (error) {
            console.error('Error updating price:', error)
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                    <Edit2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Actualizar Precio de Venta</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="price">Precio por Kilogramo (COP)</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                            <Input
                                id="price"
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="pl-7"
                                placeholder="Ej. 9500"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Lote: {species}
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isUpdating}>
                        Cancelar
                    </Button>
                    <Button onClick={handleUpdate} disabled={isUpdating || !price}>
                        {isUpdating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Actualizando...
                            </>
                        ) : (
                            'Guardar Precio'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
