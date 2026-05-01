import {
  SYSTEM_IDENTITY,
  SYSTEM_RULES,
  SYSTEM_SCHEMA,
  SYSTEM_EXAMPLES,
} from "./prompt-sections";

export const LAURA_SYSTEM_PROMPT = `${SYSTEM_IDENTITY}

${SYSTEM_RULES}

${SYSTEM_SCHEMA}

${SYSTEM_EXAMPLES}

Contexto del cliente:
{INJECTED_CONTEXT}

Mensajes anteriores en esta sesión:
{INJECTED_MESSAGES}

Resumen de agenda pendiente:
{INJECTED_AGENDA}`.trim();