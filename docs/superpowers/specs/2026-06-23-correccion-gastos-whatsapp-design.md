# Corrección de gastos por WhatsApp

**Fecha:** 2026-06-23
**Estado:** Aprobado (diseño)

## Problema

Cuando un admin pide corrección de un gasto desde el panel, el comercial solo
se entera al entrar a la app. Queremos: (1) avisarle por WhatsApp con el motivo
de la corrección y (2) que pueda corregir el gasto desde el mismo chat,
conversando con Nora.

## Decisiones tomadas

- **Corrección conversacional con Nora** (no link al panel, no solo aviso).
- **Solo campos de texto** (monto, categoría, descripción, proveedor, NIT,
  número de factura, método de pago, fecha, cliente). Sin re-OCR de nueva foto.
- **Nora confirma y reenvía**: al terminar, pasa el gasto de
  `requiere_correccion → pendiente` y cierra el caso.
- **Notificación vía plantilla (template)** de WhatsApp, no texto libre.

## Constraint de plataforma: ventana de 24h

WhatsApp prohíbe mensajes de texto libre a un usuario que no escribió en las
últimas 24h; fuera de esa ventana solo pasan plantillas aprobadas por Meta. La
notificación de corrección es saliente y normalmente cae fuera de la ventana,
así que **debe enviarse como template**. Cuando el comercial responde, la
ventana se abre y el resto de la conversación (corrección con Nora) corre libre.

## Flujo end-to-end

1. Admin pide corrección en el panel → `status: requiere_correccion` +
   `reviewNote`. (Ya existe: `commercial-expenses.service.ts:332` `updateStatus`.)
2. **(nuevo)** Tras el commit, el API:
   - resuelve el teléfono del comercial (`expense.submittedBy.phone`),
   - hace find-or-create de la conversación de WhatsApp,
   - abre un caso Nora tipo `expense` en modo corrección,
   - envía el template `correccion_gasto`.
3. Comercial responde → el routing existente detecta el caso `expense` abierto
   (`nora-routing.service.ts:287` `isExpenseFlowTurn`) y enruta al agente Nora.
4. **(nuevo)** Nora aplica el cambio pedido con el tool `update_expense`,
   confirma una vez, y al confirmar el comercial reenvía
   (`resubmit=true`): el gasto vuelve a `pendiente` y el caso se cierra.

## Componentes

### 1. Disparador — `commercial-expenses.service.ts`
En `updateStatus`, tras el `$transaction`, si
`dto.status === requiere_correccion`, llamar
`whatsAppService.notifyExpenseCorrection(updated)`.
- No bloqueante: envolver en try/catch, loguear fallo. El cambio de estado se
  mantiene aunque la notificación falle (el comercial igual lo ve en la app).
- `commercialExpenseInclude` debe traer `submittedBy` con `phone`, `name`.

### 2. `notifyExpenseCorrection(expense)` — `whatsapp.service.ts`
- Si `expense.submittedBy?.phone` está vacío → log y return (degradación limpia;
  ojo: en producción `resolveUserByPhoneInNonProduction` no aplica, el comercial
  debe tener `phone` en su `User` — ver `whatsapp.service.ts:447`).
- **Find-or-create conversación**: upsert por `accountId_waId` (mismo patrón que
  `kapso-webhook.service.ts:44`). El `WhatsAppAccount` se elige por defecto
  (asumimos un único account activo; si hay varios, tomar el del gasto/empresa).
  `waId` = teléfono normalizado del comercial.
- **Abrir caso Nora** vía `noraCaseService.createCase`:
  - `type: expense` (reusa el tipo → el routing ya lo enruta),
  - `status: collecting_info`,
  - `extractedData`: campos actuales del gasto + marcadores
    `{ mode: "correction", expenseId, reviewNote }`,
  - `createdByUserId`: el comercial.
- **Enviar template** `correccion_gasto` (ver sección Kapso).

### 3. `sendTemplate` + rama template en `sendViaKapso` — `whatsapp.service.ts`
Hoy solo existe `sendText` (`whatsapp.service.ts:396`). Agregar:
- `sendTemplate(phoneNumberId, to, templateName, languageCode, params)` que llame
  `client.messages.sendTemplate({...})` (SDK `@kapso/whatsapp-cloud-api@0.2.1`,
  método ya disponible: `index.d.ts:726`).
- Registrar el `WhatsAppMessage` saliente igual que en
  `createAndSendOutboundMessage` (queued → sent/failed), reusando esa lógica con
  un parámetro de "kind: text | template" para no duplicar.
- Respetar el guard de tests/sin API key (devuelve mock, igual que `sendViaKapso`).

### 4. `PATCH /whatsapp/agent/expenses/:id` — `nora-agent.controller.ts` + execution service
- DTO con campos editables opcionales + `resubmit?: boolean`.
- Actualiza los campos de texto del gasto.
- Si `resubmit === true`: transición `requiere_correccion → pendiente` y cierra
  el caso Nora (mirror de cómo el create claim/cierra el caso en
  `nora-expense-execution.service.ts`).
- **Autorización**: el comercial que envió el gasto (`submittedByUserId`). El
  panel ya permite al comercial re-enviar desde `requiere_correccion`
  (`expense-status-action.tsx`), así que reusar esa regla. Roles del controller
  ya incluyen `comercial`.

### 5. Agente Nora — `agents/nora/`
- **`tools/expenses.py`**: nuevo tool `update_expense(expense_id, ...campos,
  resubmit, conversation_id, auth_token)` → `PATCH /whatsapp/agent/expenses/:id`.
  Mismo manejo de errores que `create_expense` (devolver texto crudo con "Error").
- **`whatsapp_agent.py`**: agregar `update_expense` a `EXPENSE_TOOLS`. Extender
  `_case_context_block` para incluir, cuando `extractedData.mode == "correction"`,
  el `expense_id` y el `motivo de correccion`.
- **`prompts/expense_agent.py`**: rama de corrección. Cuando el caso es modo
  corrección: Nora explica el motivo, pide/aplica el cambio puntual, confirma una
  vez, y al confirmar llama `update_expense(expense_id=..., resubmit=true)`.
  Tras reenviar, confirma con naturalidad que volvió a revisión.

## Cómo hacer la plantilla en Kapso

Usa el skill `integrate-whatsapp` (scripts en `scripts/`). Pasos:

**1. Descubrir IDs** (necesitas `business_account_id` para crear la plantilla y
`phone_number_id` para enviarla):
```bash
node scripts/list-platform-phone-numbers.mjs
# o, con CLI:
kapso whatsapp numbers resolve --phone-number "<numero-display>" --output json
```

**2. Definir la plantilla** (categoría `UTILITY`, params nombrados). Guardar como
`correccion-gasto.json`:
```json
{
  "name": "correccion_gasto",
  "language": "es",
  "category": "UTILITY",
  "parameter_format": "NAMED",
  "components": [
    {
      "type": "BODY",
      "text": "Hola {{nombre}}, tu gasto por {{valor}} requiere corrección. Motivo: {{motivo}}. Respóndeme aquí y te ayudo a corregirlo.",
      "example": {
        "body_text_named_params": [
          { "param_name": "nombre",  "example": "Carlos" },
          { "param_name": "valor",   "example": "$50.000" },
          { "param_name": "motivo",  "example": "falta el NIT del proveedor" }
        ]
      }
    }
  ]
}
```
Notas (reglas de templates del skill): usar `language` (no `language_code`),
`parameter_format: "NAMED"`, e incluir `example` por cada variable o Meta rechaza.

**3. Crear la plantilla en Meta vía Kapso:**
```bash
node scripts/create-template.mjs --business-account-id <WABA_ID> --file correccion-gasto.json
```

**4. Esperar aprobación de Meta** (UTILITY suele aprobar en minutos–horas, a
veces hasta 1–2 días). Verificar estado:
```bash
node scripts/template-status.mjs --business-account-id <WABA_ID> --name correccion_gasto
# estado esperado: APPROVED
```

**5. Probar envío** (antes de cablear el API):
```bash
node scripts/send-template.mjs --phone-number-id <PHONE_NUMBER_ID> --file send-correccion-gasto.json
```
con `send-correccion-gasto.json`:
```json
{
  "messaging_product": "whatsapp",
  "to": "<telefono-comercial>",
  "type": "template",
  "template": {
    "name": "correccion_gasto",
    "language": { "code": "es" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "parameter_name": "nombre", "text": "Carlos" },
          { "type": "text", "parameter_name": "valor",  "text": "$50.000" },
          { "type": "text", "parameter_name": "motivo", "text": "falta el NIT del proveedor" }
        ]
      }
    ]
  }
}
```

**6. En el API**, `sendTemplate` (componente 3) construye ese mismo
`components` con los params nombrados y llama `client.messages.sendTemplate`. El
nombre y el idioma de la plantilla van como constantes (`correccion_gasto`, `es`).

## Lo que NO se hace (YAGNI)

- Sin re-OCR de nueva foto.
- Sin nuevo `NoraConversationCaseType` (se reusa `expense`).
- Sin editar gastos en otros estados (solo `requiere_correccion`).
- Sin botones interactivos en la plantilla (texto simple; el comercial responde
  y eso abre la ventana de 24h).

## Pruebas

- **NestJS e2e**: cambiar estado a `requiere_correccion` dispara
  `notifyExpenseCorrection` (Kapso mockeado), crea conversación + caso `expense`
  con `extractedData.mode == "correction"` y registra el mensaje saliente.
- **NestJS e2e**: `PATCH /whatsapp/agent/expenses/:id` con `resubmit=true` deja
  el gasto en `pendiente` y cierra el caso; sin permiso del submitter → 403.
- **Python**: self-check del tool `update_expense` (payload correcto, manejo de
  error "Error ...").

## Riesgos / dependencias

- **Aprobación de Meta** de la plantilla es externa y bloquea el paso 2 en
  producción. La corrección conversacional (pasos 3–4) se puede desarrollar y
  testear en paralelo.
- **Teléfono del comercial** debe estar en `User.phone` en producción; sin él no
  hay a quién notificar (degradación: solo queda el flujo de la app).
- **Account por defecto**: si hay más de un `WhatsAppAccount`, definir cuál usar
  para el envío saliente.
