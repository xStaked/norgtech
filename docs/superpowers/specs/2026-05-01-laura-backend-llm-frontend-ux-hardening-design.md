# Laura — Backend LLM + Frontend UX Hardening

Fecha: 2026-05-01

## Objetivo

Reemplazar el extractor determinístico (stub) de Laura con un proveedor LLM real, mejorar el fuzzy matching de contexto, arreglar los issues críticos de UX en el frontend, y preparar la arquitectura para RAG futuro.

## Contexto

Laura tiene frontend completo y backend funcional en la branch `laura-task-1`, pero el extractor es un stub determinístico con keyword-matching hardcodeado y fechas fijas. El system prompt tiene 5 líneas sin ejemplos ni reglas de negocio. El frontend tiene issues de UX: sin streaming, sin auto-scroll, objections como comma-separated string, agenda sin UI dedicada.

## Puntos flojos detectados

### Backend LLM

1. **B1 — Extractor determinístico sin inteligencia**: `DeterministicLauraExtractorProvider` usa regex hardcodeado, fechas fijas, 3 keywords por función, buyingIntent siempre "medio"
2. **B2 — System prompt inservible**: 5 líneas sin personalidad, ejemplos, ni schema de salida
3. **B3 — Sin proveedor LLM real**: `LAURA_EXTRACTOR_PROVIDER` bindea al stub determinístico
4. **B4 — Fuzzy matching sin scoring**: `includes()` substring matching genera falsos positivos, sin umbral de confianza
5. **B5 — Sin timeouts/retries**: Llamada al extractor sin timeout ni retry
6. **B6 — recentMessages se ignora**: El stub hace `void input.recentMessages`; sin memoria conversacional
7. **B7 — Clarificación limitada a "customer"**: `createClarificationResponse` hardcodea `type: "customer"` siempre
8. **B8 — Fechas de seguimiento hardcodeadas**: `inferFollowUpDate` devuelve siempre la misma fecha
9. **B9 — Task block siempre descartado**: Persistencia no crea tareas internas
10. **B10 — Agenda sin priorización vencida**: No distingue overdue vs due-today
11. **B11 — Sin rate limiting**: Endpoint sin throttle
12. **B12 — Sin sanitización XSS**: Contenido del usuario sin sanitizar

### Frontend

1. **F1 — Sin streaming**: fetch + response.json() congela la UI 5-30s
2. **F2 — Error destruye mensaje**: El mensaje se agrega optimistamente y se remueve si falla
3. **F3 — Agenda sin UI dedicada**: Modo agenda renderiza solo texto plano
4. **F4 — Objections como comma-separated**: Se rompe con comas internas
5. **F5 — Sin auto-scroll**: Mensajes nuevos no scrollean automáticamente
6. **F6 — Fechas hardcodeadas sin feedback**: dueAt siempre muestra la misma fecha
7. **F7 — Session solo en memoria**: Se pierde al recargar (V1 consciente)
8. **F8 — Sin validación client-side**: Solo valida que no esté vacío
9. **F9 — Estilos 100% inline**: Difícil mantener y extender

## Decisión de enfoque: LLM-first

Se eligió el **Enfoque A (LLM-first)**: conectar LLM real primero, luego pulir frontend. Razones:

- El stub mejorado sigue siendo "falso" — no valida si la UX funciona con datos reales
- Los tests e2e ya prueban el contract; el adapter pattern permite swapear implementaciones
- Sin LLM, la experiencia end-to-end no es representativa

## Diseño

### D1. OpenAI Laura Extractor Provider

**Archivo nuevo:** `apps/api/src/modules/laura/lura-openai-extractor.provider.ts`

```typescript
@Injectable()
export class OpenAILauraExtractorProvider implements LauraExtractorProvider {
  private client: OpenAI;

  constructor(private configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: configService.get('OPENAI_API_KEY'),
    });
  }

  async extract(input: {
    message: string;
    contextSummary?: string;
    recentMessages: string[];
    systemPrompt: string;
  }): Promise<string> {
    const filledPrompt = fillPromptSections(input.systemPrompt, {
      context: input.contextSummary ?? '',
      recentMessages: input.recentMessages.join('\n'),
    });

    const response = await this.client.chat.completions.create({
      model: this.configService.get('LAURA_LLM_MODEL', 'gpt-4o-mini'),
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: filledPrompt },
        { role: 'user', content: input.message },
      ],
    }, { timeout: 30_000 });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new BadRequestException('Laura extractor returned empty response');
    }
    return content;
  }
}
```

**Module binding:**

```typescript
{
  provide: LAURA_EXTRACTOR_PROVIDER,
  useClass: process.env.OPENAI_API_KEY
    ? OpenAILauraExtractorProvider
    : DeterministicLauraExtractorProvider,
}
```

**Variables de entorno nuevas:**
- `OPENAI_API_KEY` — clave de OpenAI
- `LAURA_LLM_MODEL` — modelo a usar (default: `gpt-4o-mini`)
- `LAURA_LLM_TIMEOUT_MS` — timeout en ms (default: `30000`)

### D2. System Prompt RAG-ready

**Archivo:** `apps/api/src/modules/laura/prompts/laura-system-prompt.ts`

El prompt se estructura con secciones inyectables:

```
{SYSTEM_IDENTITY}
{SYSTEM_RULES}
{SYSTEM_SCHEMA}
{SYSTEM_EXAMPLES}
{INJECTED_CONTEXT}
{INJECTED_MESSAGES}
{INJECTED_AGENDA}
```

#### SYSTEM_IDENTITY

Eres Laura, asistente comercial del CRM Norgtech. Tu trabajo es ayudar a los comerciales a registrar visitas, seguimientos y oportunidades de forma rápida y natural.

Tu tono es cálido, cercano, breve y profesional. Nunca menciones que eres una IA. Nunca des respuestas tipo menú de opciones.

#### SYSTEM_RULES

1. Si hay ambigüedad en el cliente, oportunidad, fecha o acción principal, responde en modo "clarification" con las opciones detectadas.
2. Nunca inventes datos que no estén en el mensaje del usuario o en el contexto proporcionado.
3. Convierte todas las fechas relativas a formato ISO 8601. "mañana" → calcula desde hoy. "el viernes" → próximo viernes.
4. Si el usuario pregunta por pendientes, agenda o prioridades, responde en modo "agenda_query".
5. Si el usuario responde a una clarificación previa (ej: "sí, el primero"), usa el contexto de mensajes anteriores para resolver la ambigüedad.
6. Extrae objeciones explícitamente mencionadas. No infieras objeciones que el usuario no mencionó.
7. Si no puedes detectar un cliente, deja customerName como null.

#### SYSTEM_SCHEMA

```json
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
  }
}
```

#### SYSTEM_EXAMPLES

**Input:** "Estuve con Agropecuaria Lara ayer, quieren propuesta para 2 galpones, les preocupa el costo inicial y debo hablar con compras el martes."

**Output:**
```json
{
  "intent": "report",
  "customerName": "Agropecuaria Lara",
  "interactionSummary": "Visita a Agropecuaria Lara. Quieren propuesta para 2 galpones. Preocupación por costo inicial. Pendiente hablar con compras.",
  "suggestedOpportunityTitle": "Propuesta galpones Agropecuaria Lara",
  "suggestedOpportunityStage": "cotizacion",
  "suggestedNextStep": "Enviar propuesta comercial para 2 galpones",
  "suggestedFollowUpDate": "[ próximo martes ISO 8601 ]",
  "suggestedTaskTitle": "Hablar con departamento de compras",
  "taskType": "reunion",
  "signals": {
    "objections": ["costo inicial"],
    "risk": "medio",
    "buyingIntent": "alto"
  }
}
```

**Input:** "Qué tengo pendiente hoy"

**Output:**
```json
{
  "intent": "agenda_query"
}
```

### D3. Fuzzy Matching con Scoring

**Archivo:** `apps/api/src/modules/laura/laura-context-resolver.service.ts`

Reemplazar `includes()` subsstring matching con Jaro-Winkler similarity + umbrales:

| Score | Result |
|-------|--------|
| 1.0 (exact) | `resolved, confidence: high` |
| >= 0.90 | `resolved, confidence: high` |
| >= 0.80 | `resolved, confidence: medium` |
| >= 0.70, multiple | `ambiguous` with options |
| < 0.70 | `unresolved` |

Buscar sobre: `displayName`, `legalName`, `contacts[].fullName`. Score = mejor match entre todos los campos.

**Librería:** `jaro-winkler` (npm) para la distancia, sin dependencias pesadas.

### D4. Clarificación multi-tipo

**Archivo:** `apps/api/src/modules/laura/laura.service.ts`

Expandir `createClarificationResponse` para soportar:

- `type: "customer"` — múltiples clientes coinciden (ya existe)
- `type: "opportunity"` — múltiples oportunidades coinciden para un cliente
- `type: "date"` — fecha ambigua ("el martes" sin contexto de qué martes)
- `type: "action"` — ambigüedad en la acción principal ("quiere" = compra? = reunión?)

Cuando el LLM detecta ambigüedad pero el context resolver no, el service genera la clarificación adecuada según el campo ambiguo.

### D5. Date Parsing con chrono-node

**Archivo nuevo:** `apps/api/src/modules/laura/laura-date-parser.ts`

Usar `chrono-node` con locale `es` para parsear:
- "el viernes" → próximo viernes
- "mañana" → tomorrow
- "próxima semana" → next Monday
- "el 15 de mayo" → 2026-05-15

El extractor LLM produce fechas ISO 8601 directamente, pero `chrono-node` se usa como fallback en el service cuando el LLM no produce fecha válida.

### D6. Agenda con Priorización

**Archivo:** `apps/api/src/modules/laura/laura.service.ts` — `buildAgendaPayload`

Agregar lógica de priorización:

```
priorityGroup:
  0 — overdue (dueAt < hoy)
  1 — due-today (dueAt entre hoy 00:00 y 23:59)
  2 — scheduled-today (visit.scheduledAt hoy)
  3 — this-week (dueAt o scheduledAt esta semana)
```

Incluir `priorityGroup` y `scheduledAt` en la respuesta de agenda para que el frontend pueda mostrar badges de prioridad.

### D7. Task Block Persistence

**Archivo:** `apps/api/src/modules/laura/laura-persistence.service.ts`

En vez de siempre descartar `task`, persistir como `FollowUpTask` con tipo `llamada` por defecto si el `followUp` block no está habilitado. Si `followUp` sí está habilitado, el `task` block se descarta (redundante).

### D8. Controller — Rate Limiting

**Archivo:** `apps/api/src/modules/laura/laura.controller.ts`

Agregar `@Throttle(10, 60)` — máximo 10 mensajes por minuto por usuario. NestJS `@nestjs/throttler`.

### D9. Frontend — Streaming SSE

**Backend:** Modificar `POST /laura/messages` para soportar `Accept: text/event-stream`. Si el cliente envía este header, responder con SSE:

```
event: message
data: {"mode": "proposal", "sessionId": "...", ...}
```

Si no, mantener comportamiento actual (JSON response).

**Frontend — Nuevo archivo:** `apps/web/src/lib/laura-sse.client.ts`

```typescript
export function streamLauraMessage(
  payload: CreateMessagePayload,
  onEvent: (event: LauraAssistantResponse) => void,
  onError: (error: Error) => void,
): AbortController {
  const controller = new AbortController();
  fetch('/laura/messages', {
    method: 'POST',
    headers: { 'Accept': 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal,
  }).then(async (response) => {
    // Parse SSE stream
  });
  return controller;
}
```

**`laura-chat.tsx`:** Usar streaming cuando esté disponible, fallback a JSON si no.

### D10. Frontend — Auto-scroll

**Archivo:** `apps/web/src/components/laura/laura-message-list.tsx`

Agregar `useEffect` con `ref.current.scrollIntoView({ behavior: 'smooth' })` cuando lleguen mensajes nuevos o el indicador de "procesando".

### D11. Frontend — Error Handling Resiliente

**Archivo:** `apps/web/src/components/laura/laura-chat.tsx`

En vez de agregar mensaje optimistamente y removerlo si falla:
1. Agregar mensaje con status `pending`
2. Si falla, marcar mensaje con status `error` + botón de "Reintentar"
3. Si tiene éxito, cambiar status a `confirmed`

### D12. Frontend — Objections como Chips

**Archivo:** `apps/web/src/components/laura/laura-proposal-card.tsx`

Reemplazar el `<input>` con `value.split(",")` por un componente de chips:
- Mostrar cada objeción como un chip eliminable
- Input para agregar nuevas objeciones (Enter para agregar)
- Sin separar por comas

### D13. Frontend — Agenda Cards

**Archivo nuevo:** `apps/web/src/components/laura/laura-agenda-card.tsx`

Cuando `mode === "agenda"`, renderizar items con:
- Ícono por tipo (visita/tarea)
- Badge de prioridad (overdue/due-today/this-week)
- Fecha formateada
- Link al registro original

### D14. Frontend — Validación

**Archivo:** `apps/web/src/components/laura/laura-composer.tsx`

- Deshabilitar "Enviar" si mensaje tiene < 5 caracteres
- Mostrar placeholder contextual aleatorio de una lista de ejemplos
- Indicador visual de caracteres

### D15. RAG-ready Pattern

El system prompt se structure con secciones inyectables que permiten agregar contexto enriquecido en el futuro sin cambiar la interfaz del provider:

```
{SYSTEM_IDENTITY}        ← estático
{SYSTEM_RULES}            ← estático
{SYSTEM_SCHEMA}           ← estático
{SYSTEM_EXAMPLES}         ← estático
{INJECTED_CONTEXT}        ← V1: customer name; V2+: vector search results
{INJECTED_MESSAGES}        ← últimos N mensajes
{INJECTED_AGENDA}          ← resumen de pendientes
```

Para V2+ con RAG:
1. Crear `RAGContextProvider` que hace embedding search sobre visitas, notas, oportunidades
2. Inyectar resultados relevantes en `{INJECTED_CONTEXT}`
3. Sin cambiar `LauraExtractorProvider`, `LauraService`, ni el frontend

## Orden de implementación sugerido

### Wave 1 — Backend LLM + Frontend Crítico

1. Crear `OpenAILauraExtractorProvider` + system prompt completo
2. Agregar `jaro-winkler` al context resolver
3. Agregar `chrono-node` para parsing de fechas
4. Agregar timeout y retry al extractor
5. Rate limiting en controller
6. Frontend: auto-scroll en message list
7. Frontend: error handling resiliente
8. Frontend: objections como chips

### Wave 2 — Backend Mejoras + Frontend UX

9. Clarificación multi-tipo (opportunity, date, action)
10. Agenda con priorización (priority groups)
11. Task block persistence como FollowUpTask
12. Frontend: agenda cards UI
13. Frontend: validación en composer
14. Frontend: SSE streaming (backend + frontend)

## Criterios de éxito

- [ ] El extractor LLM produce respuestas relevantes en >80% de casos de prueba
- [ ] Fuzzy matching reduce falsos positivos vs el `includes()` actual
- [ ] Fechas relativas se parsean correctamente al >90%
- [ ] Frontend no congela la UI durante llamadas LLM
- [ ] Auto-scroll funciona sin flickering
- [ ] Objections se pueden agregar/eliminar sin comas rotas
- [ ] Agenda muestra items con badges de prioridad
- [ ] Tests e2e existentes siguen pasando con stub determinístico
- [ ] Tests e2e nuevos pasan con provider OpenAI (con mocking)