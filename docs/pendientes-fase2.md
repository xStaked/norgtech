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
Fuente: transcripción Sec. 1. El comercial monta la lista/cotización especial y queda
guardada en estado revisión; hasta que el admin la aprueba no se libera el precio.
Recoger las negociaciones ya hechas: Aviesa y Cámbulos tienen lista especial.
Duda operativa (Sec. 1, SPEAKER_02): qué pasa sin señal — hoy queda registrada en
revisión y se libera al aprobar. Por definir si el comercial puede cotizar con ella
mientras está pendiente o solo después de aprobada.

## 4. Bonificaciones por distribuidor (10, 20, 30 o 40%)
Fuente: transcripción Sec. 1. Opción de bonificación sobre la lista de precios.
La unidad bonificada va a cero pesos pero sí se calcula el IVA.
Abierto: confirmar la base del IVA (transcripción entrecortada en ese punto).

## 5. Histórico de precios por producto
Fuente: transcripción Sec. 3. Dos cosas distintas pedidas:
a) último precio vendido por producto + cliente (ej. "último precio de CK a Grupo Bios")
como referencia al cotizar; b) historial del precio de lista.
Hoy no existe ninguno de los dos. Se apoya en el `PUT /price-lists/:id/items` actual;
falta persistir y mostrar el log. Relacionado con punto 1.

## 6. Reportes de deudores + morosos desde el agente
Fuente: transcripción Sec. 5–8. Decisión explícita: el agente SÍ puede informar
quiénes están en mora / +30 días (herramienta de consulta), pero NO envía mensajes
ni hace cobro automático — tema sensible y personalizado, descartado (SPEAKER_03).
Si lo insisten, se consulta con la parte administrativa.
El informe de cartera ya circula por correo; pidieron retroalimentación a más tardar mañana.

## 7. Ajuste contable / facturación / cartera
Fuente: transcripción Sec. 8–10. Revisión con la parte administrativa + capacitación
del equipo administrativo (esta tarde o mañana en la mañana). Incluye transición a
comisionar por ventas por cuotas/cumplimiento. Alcance detallado pendiente de esa reunión.

## 8. Modales para formularios pequeños
Hecho en commit `6cae28d`: oportunidades, cartera, devoluciones, visitas y
seguimientos crean en modal desde la lista (mismo patrón que facturación).
Las páginas `/new` se mantienen como respaldo. Cada form acepta `onSuccess`
y el modal cierra + refresca la lista.

## 9. Inmediato post-reunión (operativo, no desarrollo)
Fuente: transcripción Sec. 10–14. Crear usuarios a todos hoy; enviar link de la
plataforma + teléfono del agente; el equipo prueba y retroalimenta; nueva reunión
de seguimiento en 2–3 días (tarde, 5:30–6pm).
