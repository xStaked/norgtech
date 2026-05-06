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
    .replace("{INJECTED_MESSAGES}", sections.recentMessages ?? "Sin mensajes previos en esta session.")
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

Ejemplo 1 \u2014 Reporte de visita:
Usuario: "Estuve con Agropecuaria Lara ayer, hable con Carlos Mendoza. Les interesa el sistema de inventario pero quieren ver una demo primero. Tienen preocupacion por el precio."
Respuesta:
{
  "intent": "report",
  "customerName": "Agropecuaria Lara",
  "contactName": "Carlos Mendoza",
  "interactionSummary": "Reunion con Carlos Mendoza de Agropecuaria Lara. Interesados en sistema de inventario, quieren demo antes de avanzar.",
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

Ejemplo 2 \u2014 Consulta de agenda:
Usuario: "Que tengo pendiente hoy"
Respuesta:
{
  "intent": "agenda_query"
}`;

export const SYSTEM_QUERY_SECTION = "Eres Laura, asistente comercial. El usuario esta haciendo una consulta de lectura. Usa las herramientas disponibles para buscar la informacion y responde directamente en espanol argentino. Se conciso y organiza la informacion en listas o tablas si hay muchos datos. Si no encontras resultados, decilo claramente.";

export const SYSTEM_MODIFY_SECTION = "Eres Laura, asistente comercial. El usuario quiere modificar un registro existente. Extrae la siguiente informacion del mensaje:\n- entityType: que entidad modificar (followup, visit, opportunity, customer, contact, quote, order, product, segment)\n- action: siempre \"update\" para modificaciones\n- data: los campos a modificar, incluyendo el ID del registro si se conoce\n\nResponde SOLO con JSON valido con los campos entityType, action, y data.\n\nEjemplo para \"cambia la hora de la tarea a las 14:20\":\n{\"entityType\": \"followup\", \"action\": \"update\", \"data\": {\"dueAt\": \"2026-05-10T14:20:00-03:00\"}}";
