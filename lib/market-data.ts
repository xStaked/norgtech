import { createClient } from './supabase/server'

export interface MarketPrice {
    species: string
    price_min: number
    price_max: number
    price_avg: number
    unit: string
    source: string
    market_date: string
    city?: string
}

/**
 * Precios curados de respaldo para acuicultura en Colombia.
 * Se usan cuando la tabla market_prices no existe o está vacía.
 */
function getMockMarketPrices(): MarketPrice[] {
    const today = new Date().toISOString().split('T')[0]
    return [
        { species: 'Tilapia roja', price_min: 8800, price_max: 10500, price_avg: 9500, unit: 'kg', source: 'SIPSA - Corabastos (referencia)', market_date: today },
        { species: 'Mojarra lora', price_min: 7800, price_max: 9500, price_avg: 8500, unit: 'kg', source: 'SIPSA - Corabastos (referencia)', market_date: today },
        { species: 'Cachama', price_min: 6800, price_max: 8500, price_avg: 7500, unit: 'kg', source: 'SIPSA - Referencia', market_date: today },
        { species: 'Trucha arcoíris', price_min: 11500, price_max: 15000, price_avg: 13000, unit: 'kg', source: 'SIPSA - Corabastos (referencia)', market_date: today },
    ]
}

export async function getColombianMarketPrices(): Promise<MarketPrice[]> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('market_prices')
            .select('*')
            .order('market_date', { ascending: false })
            .limit(50)

        if (error) {
            // Tabla no existe o error de permisos
            console.warn('market_prices table error (¿tabla creada en Supabase?):', error.message)
            return getMockMarketPrices()
        }

        if (!data || data.length === 0) {
            console.info('market_prices vacía — usando precios de referencia. Ejecuta POST /api/market-prices/sync para poblar.')
            return getMockMarketPrices()
        }

        // Deduplicar: devolver el precio más reciente por especie
        const latestBySpecies = new Map<string, typeof data[0]>()
        for (const item of data) {
            const existing = latestBySpecies.get(item.species)
            if (!existing || new Date(item.market_date) > new Date(existing.market_date)) {
                latestBySpecies.set(item.species, item)
            }
        }

        return Array.from(latestBySpecies.values()).map(item => ({
            species: item.species,
            price_min: Number(item.price_min),
            price_max: Number(item.price_max),
            price_avg: Number(item.price_avg),
            unit: item.unit,
            source: item.source,
            market_date: item.market_date,
            city: item.city,
        }))
    } catch (e) {
        console.error('getColombianMarketPrices falló, usando referencia:', e)
        return getMockMarketPrices()
    }
}

export function formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
    }).format(amount)
}
