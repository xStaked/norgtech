# Pendientes Fase 2 — Reunión de entrega

Acordado con cliente final. No bloquea entrega.
Temas 3–9 levantados al cierre de la reunión; detalle fino pendiente de la transcripción.

## 1. Módulo de gestión de listas de precios
**Problema:** hoy las listas solo se crean vía script (`prisma/scripts/import-catalog.ts`
desde el Excel, cada hoja = una lista). No hay `POST /price-lists` ni pantalla admin.
El selector en cliente ya agrupa/sugiere (commit `2011177`), pero el admin no puede
crear, clonar ni auditar listas desde la UI.
Ya existe `/price-lists` solo-lectura (commit `2db41e4`).
**Alcance propuesto:**
- `POST /price-lists` + `PATCH /price-lists/:id` (solo `administrador`, `director_comercial`).
- Crear vacía / clonar desde existente / desactivar.
- Importar Excel desde la UI (subir archivo, dry-run, aplicar) en vez de script local.
- Asignación masiva a clientes + historial de cambios de precio (quién/cuándo).
- Warning en cotización cuando el cliente va a precio base.

## 2. Calendario
**Problema:** no hay componente calendario propio ni librería
(`package.json` sin date-picker/big-calendar/fullcalendar). Fechas con `Input type="date"`
nativo y agenda como lista (hoy/semana/vencidos).
**Alcance propuesto:**
- Date-picker con estilo del sistema para formularios.
- Vista mensual/semanal en `/agenda` con visitas y seguimientos, clic a detalle.
- Evaluar librería vs. componente propio (seguir patrón `Select` sobre `@base-ui/react`).

## 3. Listas especiales por cliente con aprobación del admin
El comercial solicita lista especial para un cliente; queda pendiente hasta que el
admin la aprueba (flujo tipo `orders/review`). Definir estados y quién puede usarla
mientras está pendiente. Detalle pendiente de transcripción.

## 4. Bonificaciones por distribuidor (10, 20, 30 o 40)
Unidades bonificadas a cero pesos pero con IVA calculado. Definir base del IVA y cómo
se refleja en cotización/pedido/factura. Detalle pendiente de transcripción.

## 5. Histórico de precios por producto
Ver evolución de cada precio (lista/presentación) con quién y cuándo lo cambió.
Se apoya en el `PUT /price-lists/:id/items` actual; falta persistir y mostrar el log.
Relacionado con punto 1.

## 6. Reportes de deudores + morosos desde el agente
- Reporte/pantalla de deudores (cartera vencida por cliente, aging).
- El agente (Nora) debe responder cuáles son los clientes morosos.
Detalle y formato pendiente de transcripción.

## 7. Ajuste contable / facturación / cartera
Revisión con la parte administrativa en próxima reunión. Alcance pendiente.

## 8. Modales para formularios pequeños
Pasar la creación de entidades chicas a modal en vez de página completa.
Lista exacta de formularios pendiente de transcripción.
