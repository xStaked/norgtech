/**
 * SIPSA SOAP Client for DANE (Colombia)
 * This client fetches and parses market prices from the DANE SIPSA service.
 */

export interface SipsaPrice {
    id: string
    product: string
    city: string
    price_avg: number
    capture_date: string
}

const SIPSA_URL = 'https://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService'

/**
 * Fetches the latest market prices by city from the SIPSA service.
 * SOAP Action: promediosSipsaCiudad
 */
export async function fetchSipsaPricesByCity(): Promise<string> {
    const soapEnvelope = `
    <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ser="http://servicios.sipsa.co.gov.dane/">
       <soap:Header/>
       <soap:Body>
          <ser:promediosSipsaCiudad/>
       </soap:Body>
    </soap:Envelope>
  `.trim()

    const response = await fetch(SIPSA_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/soap+xml;charset=UTF-8',
        },
        body: soapEnvelope,
    })

    if (!response.ok) {
        throw new Error(`SIPSA request failed with status ${response.status}: ${await response.text()}`)
    }

    return await response.text()
}

/**
 * Parses the large SIPSA SOAP response using a memory-efficient string matching approach.
 * This is preferred over standard DOM parsers for the 100MB+ responses.
 */
export function parseSipsaXml(xml: string): SipsaPrice[] {
    const results: SipsaPrice[] = []

    // Split into <return> blocks
    const blocks = xml.split('</return>')

    for (const block of blocks) {
        if (!block.includes('<return>')) continue

        const content = block.substring(block.indexOf('<return>') + 8)

        try {
            const city = extractTag(content, 'ciudad')
            const product = extractTag(content, 'producto')
            const price = extractTag(content, 'precioPromedio')
            const date = extractTag(content, 'fechaCaptura')
            const regId = extractTag(content, 'regId')

            if (product && price) {
                results.push({
                    id: regId || Math.random().toString(36).substr(2, 9),
                    product: product,
                    city: city || 'Varios',
                    price_avg: parseFloat(price) || 0,
                    capture_date: date ? date.split('T')[0] : new Date().toISOString().split('T')[0]
                })
            }
        } catch (e) {
            console.warn('Error parsing SIPSA block:', e)
        }
    }

    return results
}

function extractTag(content: string, tag: string): string {
    const start = content.indexOf(`<${tag}>`)
    if (start === -1) return ''
    const end = content.indexOf(`</${tag}>`, start)
    if (end === -1) return ''
    return content.substring(start + tag.length + 2, end)
}
