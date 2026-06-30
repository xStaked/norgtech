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

  return <WhatsAppInbox initialConversations={conversations} />;
}
