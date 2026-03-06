import { createClient } from '@/lib/supabase/server'
import { UploadForm } from '@/components/upload-form'
import { ManualRecordForm } from '@/components/manual-record-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default async function UploadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user!.id)
    .single()

  let batches: Array<{
    id: string
    pond_name: string
    start_date: string
    status: string
  }> = []

  if (profile?.organization_id) {
    const { data: ponds } = await supabase
      .from('ponds')
      .select('id, name')
      .eq('organization_id', profile.organization_id)
      .order('sort_order', { ascending: true })
      .order('name')

    if (ponds && ponds.length > 0) {
      const pondOrderMap: Record<string, number> = {}
      for (const [index, pond] of ponds.entries()) {
        pondOrderMap[pond.id] = index
      }

      const pondIds = ponds.map(p => p.id)
      const { data: activeBatches } = await supabase
        .from('batches')
        .select('id, pond_id, start_date, status')
        .in('pond_id', pondIds)
        .eq('status', 'active')

      if (activeBatches) {
        const sortedBatches = [...activeBatches].sort((a, b) => {
          const aOrder = pondOrderMap[a.pond_id] ?? Number.MAX_SAFE_INTEGER
          const bOrder = pondOrderMap[b.pond_id] ?? Number.MAX_SAFE_INTEGER
          if (aOrder !== bOrder) return aOrder - bOrder
          return new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        })

        batches = sortedBatches.map(b => ({
          id: b.id,
          pond_name: ponds.find(p => p.id === b.pond_id)?.name ?? 'Estanque',
          start_date: b.start_date,
          status: b.status,
        }))
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nuevo Reporte</h1>
        <p className="mt-1 text-muted-foreground">
          Registra datos de produccion manualmente o sube una foto para extraccion automatica con IA
        </p>
      </div>
      <Tabs defaultValue="manual" className="w-full">
        <TabsList>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="ocr">Captura OCR</TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="mt-4">
          <ManualRecordForm batches={batches} />
        </TabsContent>
        <TabsContent value="ocr" className="mt-4">
          <UploadForm batches={batches} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
