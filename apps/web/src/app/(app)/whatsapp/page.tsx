import { WhatsAppInbox } from "@/components/whatsapp/whatsapp-inbox";
import type { WhatsAppConversation } from "@/components/whatsapp/whatsapp-types";
import { apiFetch } from "@/lib/api.server";

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  let conversations: WhatsAppConversation[] = [];
  try {
    const response = await apiFetch("/whatsapp/conversations");
    conversations = response.ok ? await response.json() : [];
  } catch {
    conversations = [];
  }

  // `?c=` abre una conversación concreta: es como la cola de revisión enlaza
  // el chat que originó cada pedido.
  const { c } = await searchParams;

  return <WhatsAppInbox initialConversations={conversations} initialConversationId={c} />;
}
