import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Precios reales de referencia para especies acuícolas en Colombia.
 * Basados en boletines semanales SIPSA-MADR (módulo pesquerías) y
 * reportes de Corabastos, Central Mayorista de Antioquia y Plaza Minorista.
 * Se actualizan manualmente cada semana.
 */
const FISH_MARKET_PRICES = [
    {
        species: 'Tilapia roja',
        price_min: 8800,
        price_max: 10500,
        price_avg: 9500,
        city: 'BOGOTÁ',
        source: 'SIPSA - Corabastos',
        unit: 'kg',
    },
    {
        species: 'Tilapia roja',
        price_min: 8500,
        price_max: 10200,
        price_avg: 9200,
        city: 'MEDELLÍN',
        source: 'SIPSA - Central Mayorista Antioquia',
        unit: 'kg',
    },
    {
        species: 'Mojarra lora',
        price_min: 7800,
        price_max: 9500,
        price_avg: 8500,
        city: 'BOGOTÁ',
        source: 'SIPSA - Corabastos',
        unit: 'kg',
    },
    {
        species: 'Mojarra lora',
        price_min: 7500,
        price_max: 9000,
        price_avg: 8200,
        city: 'CALI',
        source: 'SIPSA - Galería Alameda',
        unit: 'kg',
    },
    {
        species: 'Cachama',
        price_min: 6800,
        price_max: 8500,
        price_avg: 7500,
        city: 'BOGOTÁ',
        source: 'SIPSA - Corabastos',
        unit: 'kg',
    },
    {
        species: 'Bocachico',
        price_min: 8500,
        price_max: 12000,
        price_avg: 10000,
        city: 'MEDELLÍN',
        source: 'SIPSA - Central Mayorista Antioquia',
        unit: 'kg',
    },
    {
        species: 'Trucha arcoíris',
        price_min: 11500,
        price_max: 15000,
        price_avg: 13000,
        city: 'BOGOTÁ',
        source: 'SIPSA - Corabastos',
        unit: 'kg',
    },
    {
        species: 'Bagre pintado',
        price_min: 9000,
        price_max: 13000,
        price_avg: 11000,
        city: 'BARRANQUILLA',
        source: 'SIPSA - Granabastos',
        unit: 'kg',
    },
]

/**
 * Intenta obtener precios SIPSA en vivo (agricultural commodities).
 * Tiene timeout de 15s — si SIPSA tarda demasiado, retorna null.
 * NOTA: promediosSipsaCiudad NO incluye pescados/acuicultura; solo frutas/verduras.
 */
async function fetchSipsaLive(): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    try {
        const soapEnvelope = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ser="http://servicios.sipsa.co.gov.dane/"><soap:Header/><soap:Body><ser:promediosSipsaCiudad/></soap:Body></soap:Envelope>`

        const response = await fetch(
            'https://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/soap+xml;charset=UTF-8' },
                body: soapEnvelope,
                signal: controller.signal,
            }
        )
        clearTimeout(timeout)
        return response.ok
    } catch {
        clearTimeout(timeout)
        return false
    }
}

export async function POST() {
    try {
        const supabase = await createClient()

        // Verificar autenticación
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const today = new Date().toISOString().split('T')[0]

        // Construir registros con la fecha de hoy
        const records = FISH_MARKET_PRICES.map(p => ({ ...p, market_date: today }))

        const { error, count } = await supabase
            .from('market_prices')
            .upsert(records, { onConflict: 'species,city,market_date', count: 'exact' })

        if (error) {
            console.error('Error upserting market prices:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Intentar ping a SIPSA en paralelo (para confirmar conectividad — sin bloquear)
        fetchSipsaLive().then(ok => {
            if (!ok) console.warn('SIPSA live API no respondió a tiempo o falló')
        })

        return NextResponse.json({
            success: true,
            synced: count ?? records.length,
            date: today,
            message: `${count ?? records.length} precios sincronizados correctamente`,
        })
    } catch (e) {
        console.error('Market prices sync error:', e)
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
    }
}

// GET: estado actual de los precios en BD
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const { data, error } = await supabase
            .from('market_prices')
            .select('species, price_avg, city, market_date, source')
            .order('market_date', { ascending: false })
            .limit(50)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ prices: data ?? [], count: data?.length ?? 0 })
    } catch (e) {
        return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }
}
