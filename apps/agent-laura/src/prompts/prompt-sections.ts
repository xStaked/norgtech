interface PromptSections {
  context?: string;
  recentMessages?: string;
  agendaSummary?: string;
}

export function fillPromptSections(
  systemPrompt: string,
  sections: PromptSections,
): string {
  return systemPrompt
    .replace("{INJECTED_CONTEXT}", sections.context ?? "Sin contexto de cliente adicional.")
    .replace("{INJECTED_MESSAGES}", sections.recentMessages ?? "Sin mensajes previos en esta sesión.")
    .replace("{INJECTED_AGENDA}", sections.agendaSummary ?? "");
}

export const SYSTEM_SCHEMA = `Responde EXCLUSIVAMENTE con un JSON que siga este esquema:
{
  "intent": "report | agenda_query",
  "customerName": "string | null",
  "contactName": "string | null",
  "interactionSummary": "string",
  "suggestedOpportunityTitle": "string | null",
  "suggestedOpportunityStage": "prospecto | contacto | visita | cotizacion | negociacion | orden_facturacion | venta_cerrada | perdida",
  "suggestedNextStep": "string | null",
  "suggestedFollowUpDate": "ISO 8601 date string | null",
  "suggestedTaskTitle": "string | null",
  "taskType": "llamada | correo | reunion | whatsapp",
  "signals": {
    "objections": ["string"],
    "risk": "string | null",
    "buyingIntent": "alto | medio | bajo | null"
  },
  "needsClarification": "boolean",
  "clarificationField": "customer | opportunity | date | action | null",
  "clarificationOptions": [{ "id": "string", "label": "string" }] | null
}`;

export const SYSTEM_EXAMPLES = `Ejemplos:

Ejemplo 1 — Reporte de visita:
Usuario: "Estuve con Agropecuaria Lara ayer, hablé con Carlos Mendoza. Les interesa el sistema de inventario pero quieren ver una demo primero. Tienen preocupación por el precio."
Respuesta:
{
  "intent": "report",
  "customerName": "Agropecuaria Lara",
  "contactName": "Carlos Mendoza",
  "interactionSummary": "Reunión con Carlos Mendoza de Agropecuaria Lara. Interesados en sistema de inventario, quieren demo antes de avanzar.",
  "suggestedOpportunityTitle": "Sistema de inventario - Agropecuaria Lara",
  "suggestedOpportunityStage": "visita",
  "suggestedNextStep": "Programar demo del sistema de inventario",
  "suggestedFollowUpDate": null,
  "suggestedTaskTitle": "Programar demo con Agropecuaria Lara",
  "taskType": "reunion",
  "signals": {
    "objections": ["precio"],
    "risk": "sensibilidad al precio",
    "buyingIntent": "medio"
  },
  "needsClarification": false,
  "clarificationField": null,
  "clarificationOptions": null
}

Ejemplo 2 — Consulta de agenda:
Usuario: "Qué tengo pendiente hoy"
Respuesta:
{
  "intent": "agenda_query"
}`;