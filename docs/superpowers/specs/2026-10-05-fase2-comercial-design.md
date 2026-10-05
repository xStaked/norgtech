# Fase 2 Comercial — Design

**Fecha:** 2026-10-05
**Origen:** reunión de entrega 2026-10-05 (transcripción en
`/Users/xstaked/Desktop/projects/meeting-transcriber/outplut.md`) + acuerdos
post-reunión. Temas operativos en `docs/pendientes-fase2.md`.
**Estado:** propuesto, pendiente revisión del usuario.

## Goal

Cerrar los temas comerciales levantados en la entrega sin romper lo entregado:
reportes para administración, motor de precios (listas especiales, bonificaciones,
histórico), comisiones al vendedor y seguridad por rol. Es un CRM, no un software
contable: a administración van reportes, no lógica tributaria.

## Decisiones ya tomadas

- Comisiones al vendedor = % sobre venta cobrada (se causa al registrarse el pago).
- Bonificación (descuento en producto al distribuidor, unidad a $0 + IVA) y comisión
  (pago al vendedor por cuotas/cumplimiento) son temas distintos; ambos se mantienen.
- Cobro automático por el agente: descartado por sensible. El agente solo informa
  morosos como consulta.
- Ejecución con subagentes.

## Frente 0 — Seguridad por rol

Matriz rol × módulo × nivel antes de construir: qué ve cada rol y qué no
(ej. comercial solo sus clientes/ventas, sin costos ni comisiones ajenas).
Reglas a nivel de campo, no solo de pantalla. Cada frente se construye contra
esta matriz.
Éxito: matriz aprobada + reglas escritas.

## Frente 1 — Reportes para administración

- Deudores: cartera vencida por cliente con aging (1-30, 31-60, 61-90, +90),
  saldo, última factura y último pago. Tabla + CSV.
- Contables solo lectura: ventas por periodo con IVA discriminado (0%/5%),
  pagos recibidos, notas crédito. Sin retenciones ni DIAN.
- Agente: responde morosos / +30 días como consulta informativa.
Éxito: demo funcional en la reunión con administración.

## Frente 2 — Motor de precios

- Listas especiales con aprobación: el comercial la monta, queda en revisión,
  el admin aprueba/rechaza; solo aprobada libera el precio. Casos: Aviesa, Cámbulos.
- Bonificaciones 10/20/30/40% por línea: unidad a $0 con IVA calculado.
- Histórico de precios por producto + último precio vendido por producto+cliente
  como referencia al cotizar. Warning a precio base.
Éxito: lista especial creada por comercial, aprobada y usada en cotización real.

## Frente 3 — Comisiones al vendedor

Regla de % por vendedor por periodo; causación al pago de factura; liquidación
por periodo con estados causada/pagada. Requiere cartera estable (va después
del Frente 1). Cuotas/cumplimiento (mencionado al cierre) queda como 3b futuro.
Éxito: liquidación de un periodo desde pagos reales.

## Cierre — Auditoría + transversal

Barrido de `@Roles`, `canAccess`/`canCreate` y filtros por vendedor con pruebas
por rol. Calendario (date-picker + vista mensual en agenda) va en paralelo,
no bloquea.

## Preguntas abiertas

1. Mientras una lista especial está pendiente: ¿precio base o bloqueado?
2. Base del IVA en unidades bonificadas a $0.
3. Formularios exactos que van a modal (punto 8 hecho para 5 módulos; confirmar resto).

## Fuera de alcance

Retenciones, ReteICA, factura electrónica DIAN, cobro automático, cuotas de
comisiones (3b).
