import { PageHeader } from "@/components/ui/page-header";
import { WhatsAppInbox } from "@/components/whatsapp/whatsapp-inbox";
import type { WhatsAppConversation } from "@/components/whatsapp/whatsapp-types";
import { apiFetch } from "@/lib/api.server";

export default async function WhatsAppPage() {
  let conversations: WhatsAppConversation[] = [];
  try {
    const response = await apiFetch("/whatsapp/conversations");
    conversations = response.ok ? await response.json() : [];
  } catch {
    conversations = [];
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col gap-4">
      <PageHeader
        eyebrow="Nora WhatsApp"
        title="WhatsApp"
        description="Inbox operativo para conversaciones, respuestas y pedidos asistidos por Nora."
      />
      <WhatsAppInbox initialConversations={conversations} />
    </div>
  );
}
