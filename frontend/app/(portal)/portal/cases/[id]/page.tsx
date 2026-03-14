import { PortalCaseDetailView } from '@/components/portal/portal-case-detail-view'

interface PortalCaseDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function PortalCaseDetailPage({ params }: PortalCaseDetailPageProps) {
  const { id } = await params

  return <PortalCaseDetailView id={id} />
}
