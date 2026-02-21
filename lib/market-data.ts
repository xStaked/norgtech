/**
 * Servicio para obtener precios de mercado de productos acuicolas en Colombia.
 * En una fase posterior, esto se conectara con el servicio web SOAP del DANE (SIPSA).
 */

export interface MarketPrice {
    species: string
    price_min: number
    price_max: number
    price_avg: number
    unit: string
    source: string
    date: string
}

export async function getColombianMarketPrices(): Promise<MarketPrice[]> {
    // Simulacion de datos obtenidos de SIPSA / Corabastos
    // Basado en tendencias actuales de 2024-2025 en Colombia (COP)
    return [
        {
            species: 'Tilapia roja',
            price_min: 8500,
            price_max: 9500,
            price_avg: 9000,
            unit: 'kg',
            source: 'SIPSA - Corabastos',
            date: new Date().toISOString().split('T')[0],
        },
        {
            species: 'Mojarra lora / plateada',
            price_min: 7800,
            price_max: 8800,
            price_avg: 8300,
            unit: 'kg',
            source: 'SIPSA - Corabastos',
            date: new Date().toISOString().split('T')[0],
        },
        {
            species: 'Cachama',
            price_min: 6500,
            price_max: 7500,
            price_avg: 7000,
            unit: 'kg',
            source: 'SIPSA - Central de Abastos',
            date: new Date().toISOString().split('T')[0],
        },
        {
            species: 'Camaron blanco',
            price_min: 22000,
            price_max: 28000,
            price_avg: 25000,
            unit: 'kg',
            source: 'SIPSA - Costa Caribe',
            date: new Date().toISOString().split('T')[0],
        },
    ]
}

export function formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
    }).format(amount)
}
