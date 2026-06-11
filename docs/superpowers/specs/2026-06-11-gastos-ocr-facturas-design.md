# Gastos Comerciales - OCR de Facturas con IA

**Date:** 2026-06-11
**Status:** Approved for implementation planning
**Scope:** Prellenado asistido por IA para facturas/soportes del modulo de gastos comerciales.

## Summary

El modulo actual de gastos comerciales permite crear gastos individuales con soporte obligatorio, revision administrativa y exportacion. La siguiente evolucion es permitir que el comercial suba una factura y que la IA extraiga la mayor parte de la informacion para prellenar el formulario.

La IA no crea gastos automaticamente. Actua como asistente de captura: propone campos, muestra confianza y deja que el comercial confirme o corrija antes de guardar. El gasto formal solo se crea cuando el usuario presiona "Guardar gasto".

## Goals

- Reducir digitacion manual al registrar gastos con factura.
- Extraer datos utiles de facturas en imagen o PDF.
- Mantener confirmacion humana obligatoria antes de crear el gasto.
- Guardar los campos confirmados como datos estructurados del gasto.
- Permitir flujo manual cuando la IA falle o tenga baja confianza.
- Mantener los soportes privados y sujetos a permisos existentes.

## Non Goals

- No crear gastos automaticamente desde la IA.
- No reemplazar la revision de facturacion.
- No hacer causacion contable, impuestos o retenciones detalladas.
- No construir conciliacion con software contable.
- No exigir que todas las facturas sean legibles para permitir crear un gasto manual.
- No implementar legalizacion semanal consolidada en esta fase.

## User Flow

1. El comercial abre `/expenses/new`.
2. Sube una factura o recibo en una zona de lectura con IA.
3. El frontend envia el archivo a `POST /commercial-expenses/extract-support`.
4. El backend valida tipo y tamano, analiza el archivo con IA y devuelve sugerencias.
5. El formulario se prellena con los campos encontrados.
6. El comercial revisa, corrige o completa datos faltantes.
7. Al guardar, el frontend envia el soporte y los campos confirmados a `POST /commercial-expenses`.
8. El gasto queda en estado `pendiente`, igual que en el flujo actual.

Si la IA no puede leer el archivo, el sistema muestra un aviso y conserva el formulario manual. El comercial puede seguir creando el gasto con soporte obligatorio.

## Extracted Fields

Campos que la IA debe intentar extraer:

- `expenseDate`: fecha de factura o recibo.
- `amount`: total pagado.
- `currency`: moneda detectada, con `COP` como default.
- `category`: categoria sugerida del gasto.
- `description`: observacion sugerida para el gasto.
- `supplierName`: proveedor, comercio o establecimiento.
- `supplierNit`: NIT o identificacion tributaria del proveedor.
- `invoiceNumber`: numero de factura, recibo o documento equivalente.
- `paymentMethod`: medio de pago cuando aparezca.

Campos nuevos persistidos en `CommercialExpense`:

- `supplierName String?`
- `supplierNit String?`
- `invoiceNumber String?`
- `paymentMethod String?`
- `extractionConfidence Decimal?`
- `extractionModel String?`
- `extractionReviewedAt DateTime?`

No se guardara `extractionRawText` en esta fase para evitar almacenar texto sensible innecesario. Los errores y metadatos tecnicos se registraran en logs operativos sin exponerlos al usuario final.

## Category Mapping

La IA debe devolver una categoria valida del enum actual:

- `alimentacion`
- `transporte`
- `hospedaje`
- `combustible`
- `peajes`
- `parqueadero`
- `atencion_comercial`
- `otros`

Mapeos esperados:

- Restaurantes, almuerzos, cenas y comidas: `alimentacion`, salvo que el contexto indique invitacion a cliente, donde puede sugerir `atencion_comercial`.
- Gasolina, estaciones de servicio y combustible: `combustible`.
- Hotel, alojamiento y hospedaje: `hospedaje`.
- Peajes: `peajes`.
- Parqueaderos: `parqueadero`.
- Taxis, buses, vuelos y transporte no vehicular propio: `transporte`.
- Facturas ambiguas: `otros`.

## Confidence Model

La respuesta incluye una confianza global y confianza por campo:

- Alta: campo prellenado normalmente.
- Media: campo prellenado con indicador "Revisar".
- Baja: campo no se usa para prellenar o se muestra como sugerencia secundaria.

La confianza no bloquea la creacion manual. Solo orienta la revision del comercial.

## API Design

### `POST /commercial-expenses/extract-support`

Roles permitidos:

- `administrador`
- `director_comercial`
- `comercial`
- `facturacion`

Entrada:

- Multipart form-data con campo `support`.
- Mismos tipos y limites que los soportes actuales: JPG, PNG, WebP o PDF, maximo 10 MB.

Respuesta exitosa:

```json
{
  "status": "completed",
  "model": "gpt-4.1-mini",
  "confidence": 0.86,
  "fields": {
    "expenseDate": { "value": "2026-05-07", "confidence": 0.92 },
    "amount": { "value": 428400, "confidence": 0.91 },
    "currency": { "value": "COP", "confidence": 0.95 },
    "category": { "value": "hospedaje", "confidence": 0.82 },
    "description": { "value": "Hospedaje proveedor Grupo Pani S.A.S.", "confidence": 0.74 },
    "supplierName": { "value": "Grupo Pani S.A.S.", "confidence": 0.88 },
    "supplierNit": { "value": "900.993.290-4", "confidence": 0.84 },
    "invoiceNumber": { "value": "FE-11310", "confidence": 0.79 },
    "paymentMethod": { "value": "efectivo", "confidence": 0.62 }
  },
  "warnings": []
}
```

Respuesta con baja legibilidad:

```json
{
  "status": "low_confidence",
  "model": "gpt-4.1-mini",
  "confidence": 0.28,
  "fields": {},
  "warnings": ["No se pudo leer la factura con suficiente confianza."]
}
```

Errores:

- `400`: archivo faltante, tipo no soportado o tamano excesivo.
- `401/403`: usuario sin permisos.
- `503`: IA no disponible. El frontend debe permitir continuar manualmente.

## Backend Architecture

Agregar un servicio aislado:

- `CommercialExpenseExtractionService`: valida input normalizado, llama al proveedor de IA y convierte la respuesta al contrato interno.
- `OpenAIExpenseExtractionProvider`: implementacion inicial usando la dependencia `openai` existente en la API.
- `ExpenseExtractionResult`: tipo interno con campos, confianza y warnings.

El controlador de gastos agrega el endpoint de extraccion sin cambiar el comportamiento actual de creacion. El extractor debe tener timeout y manejo de errores para que una falla de IA no afecte el registro manual de gastos.

Variables de entorno:

- `OPENAI_API_KEY`
- `EXPENSE_EXTRACTION_MODEL`, default configurable.
- `EXPENSE_EXTRACTION_TIMEOUT_MS`, default recomendado de 30000.

Si no existe `OPENAI_API_KEY`, el endpoint responde `503` con un mensaje claro para el frontend.

## Storage Behavior

Para el MVP, la extraccion no crea un soporte definitivo en R2. El archivo se analiza y luego permanece en el input del navegador para enviarse de nuevo al guardar.

Razon: evita archivos huerfanos si el usuario sube una factura, revisa los datos y abandona la creacion.

Si el navegador no puede conservar el archivo despues de la extraccion, el fallback aceptado es pedir al usuario que lo seleccione de nuevo antes de guardar. No se introduce almacenamiento temporal en esta fase.

## Frontend Design

En `ExpenseForm` se agrega una zona superior:

- Input de archivo para "Leer factura con IA".
- Boton "Leer factura".
- Estado de carga mientras se analiza.
- Mensaje de exito, baja confianza o error.
- Indicadores pequenos en campos prellenados con confianza media.

El formulario mantiene los campos actuales y agrega:

- Proveedor.
- NIT.
- Numero de factura.
- Medio de pago.

Todos los campos prellenados son editables. El usuario conserva control total antes de guardar.

## Review And Audit

El gasto queda en `pendiente` y sigue el flujo actual de revision. Facturacion ve los campos extraidos/confirmados junto al soporte.

Al guardar un gasto con datos prellenados, se registra:

- `extractionConfidence`
- `extractionModel`
- `extractionReviewedAt`

Estos metadatos indican que hubo asistencia de IA y que el usuario confirmo los datos en el formulario.

## Security And Privacy

- El endpoint requiere autenticacion y roles existentes.
- No devuelve URLs publicas ni conserva archivos de extraccion fuera del flujo normal.
- No se guarda texto OCR completo en base de datos en esta fase.
- El prompt debe pedir salida JSON estricta y no incluir secretos ni contexto innecesario del CRM.
- Los datos sugeridos por IA se tratan como no confiables hasta que el comercial confirma.

## Testing

Backend:

- Rechaza solicitudes sin autenticacion.
- Rechaza archivo faltante, tipo no permitido y tamano excesivo.
- Con proveedor mockeado, devuelve campos extraidos y confianza.
- Con baja confianza, devuelve `low_confidence` sin bloquear flujo manual.
- Con error del proveedor, responde `503`.
- `POST /commercial-expenses` persiste los nuevos campos confirmados.

Frontend:

- Permite subir factura y prellenar campos.
- Permite editar campos prellenados antes de guardar.
- Permite crear gasto manual si la IA falla.
- Muestra indicadores de revision para campos con confianza media.
- Conserva soporte obligatorio al guardar.

## Acceptance Criteria

- Un comercial puede subir una factura y recibir sugerencias en el formulario de nuevo gasto.
- El gasto no se crea hasta que el comercial confirma.
- Los campos proveedor, NIT, numero de factura y medio de pago se guardan y aparecen en el detalle.
- Facturacion puede revisar los datos confirmados y abrir el soporte.
- Si la IA falla, el usuario puede crear el gasto manualmente.
- La exportacion XLSX/CSV incluye los nuevos campos estructurados.
