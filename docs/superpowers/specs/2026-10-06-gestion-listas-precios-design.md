# Gestión de listas de precios — Diseño

**Fecha:** 2026-10-06
**Estado:** diseño aprobado en conversación; pendiente revisión del documento
**Rama base:** `main`, con el rol `promotor` integrado por PR #9.

## Objetivo

Permitir administrar listas generales desde la aplicación y crear listas especiales con precios negociados por cliente y presentación. La tarifa especial solo debe aplicarse en cotizaciones y pedidos atribuidos al comercial propietario, sin cambiar la tarifa general ni los documentos ya emitidos. El flujo debe mostrar los importes claramente desde cotización hasta factura y cartera, sin convertir el CRM en un sistema contable.

## Enfoques considerados

1. **Una lista separada por cliente.** Reutiliza el modelo actual, pero fragmenta los grupos y no representa bien una lista con varios clientes y precios distintos por cliente.
2. **Una lista especial propiedad del comercial, con entradas por cliente y presentación. (Recomendado)** Representa grupos de clientes, permite precios diferentes para el mismo producto y conserva separado el cálculo de precios generales.
3. **Guardar precios negociados solo en cotizaciones.** Es lo más acotado, pero no permite reutilizar una negociación ni someterla a aprobación como lista.

Se elige el enfoque 2. El actual `PriceListItem` se identifica por lista y presentación, por lo que no puede guardar precios distintos del mismo producto para diferentes clientes de una lista. La solución debe conservar intacta la ruta de precios generales y añadir una entidad/flujo especial con clave lógica de lista + cliente + presentación.

## Permisos y pantallas

- La administración se integra en **Catálogo → Listas de precios** (`/price-lists`).
- **Administrador, dirección comercial y promotor:** CRUD completo de listas generales y especiales; pueden revisar, aprobar o rechazar listas especiales.
- **Comercial:** puede cargar y enviar una lista especial propia para revisión; no administra listas generales ni aprueba solicitudes ajenas. Puede corregir una solicitud rechazada y volver a enviarla.
- La lista general puede crearse vacía o clonarse, editarse desde su pantalla de detalle y desactivarse. Desactivar conserva los ítems, asignaciones e historial; no se borran físicamente.
- La carga es manual en pantalla: elegir cliente, presentación del producto e ingresar el precio. No se importa Excel.
- Una lista especial puede abarcar varios clientes y presentaciones; cada combinación cliente + presentación admite su propio precio. La moneda se hereda del cliente (COP/USD), se muestra al capturar y no es editable por el comercial.

## Reglas de aplicación y aprobación

1. La solicitud especial registra de forma inmutable al comercial propietario; la identidad no se acepta desde el body del cliente.
2. Una solicitud nace en revisión al enviarse. Solo una versión aprobada puede participar en pricing. Rechazarla deja que su propietario la corrija y la reenvíe.
3. Para una línea de cotización, buscar primero un precio especial aprobado que coincida con el comercial atribuido a la operación, el cliente y la presentación/producto. En cotizaciones se usa `createdBy`; en pedidos directos, el vendedor atribuido (`sellerUserId`). Si existe, ese valor prevalece.
4. Si no existe entrada especial para esa combinación, conservar el comportamiento vigente de la lista general del cliente; si tampoco hay precio general, conservar el fallback vigente a precio base y descuento de segmento.
5. La lista especial de un comercial no se aplica a cotizaciones/pedidos atribuidos a otro comercial aunque ambos puedan ver o administrar la lista. La aprobación administrativa habilita la lista, pero no cambia su propietario.
6. Una modificación de precios especiales aprobados debe someterse a aprobación antes de reemplazar la versión activa. La versión aprobada continúa aplicándose mientras la nueva versión está en revisión.
7. Para evitar ambigüedad, solo puede haber un precio especial aprobado activo por propietario + cliente + presentación. Al aprobar un reemplazo, este sustituye la entrada previa de esa combinación; las otras combinaciones de la lista no cambian.
8. Cada alta, edición, envío, aprobación y rechazo registra actor, fecha y valores antes/después en auditoría. Los cambios nunca recalculan cotizaciones, pedidos o facturas ya creados.

## Trazabilidad comercial y financiera

- La vista previa y creación de cotizaciones/pedidos deben usar la identidad autenticada para resolver si aplica el precio especial; vista previa y guardado deben producir el mismo resultado.
- Las líneas guardan una instantánea del precio unitario, cantidad, presentación, descuentos/bonificaciones, impuestos aplicables, moneda y origen del precio (lista especial, lista general o precio base). Guardar identificador/nombre de lista suficiente para mostrar el origen histórico aunque luego cambie la lista.
- Al crear un pedido desde cotización, conservar los importes y origen aprobados en la cotización; no volver a valorar con las tarifas vigentes.
- La factura conserva los importes facturados y su vínculo con pedido/cotización. En factura y cartera mostrar subtotal, IVA, total, pagado y saldo pendiente con etiquetas simples, usando los valores de factura/pagos/notas crédito existentes. No se agrega contabilidad general, asientos ni cálculos contables nuevos.

## Fuera de alcance

- Importación de Excel.
- Asignación masiva de listas generales a clientes.
- Cambiar el flujo general de pricing, tasas impositivas, crédito, contabilización o reglas de cartera fuera de la trazabilidad necesaria para los precios especiales.
- Cambiar el rol promotor: ya existe en esta rama y participa como rol con permisos administrativos para este módulo.

## Verificaciones y pruebas de aceptación

- API: permisos por rol; comercial solo crea/envía listas propias; no puede editar listas generales, aprobar ni alterar propietario; revisión rechazada editable y reenvío; aprobación/rechazo auditados.
- Pricing: precio especial solo para propietario + cliente + presentación en cotización y pedido; un segundo comercial recibe el precio general; un producto/presentación sin entrada especial hace fallback general; moneda viene del cliente.
- Trazabilidad: preview y quote/order guardados coinciden; cambio posterior de lista no modifica documentos guardados; pedido desde cotización conserva importes; factura/cartera presentan correctamente total, pagos y saldo.
- Web: CRUD general, clonación y desactivación; carga manual de filas especiales con producto/presentación, cliente, moneda no editable y precio; estados en revisión/aprobada/rechazada con la acción de corregir y reenviar al creador.

## Base observada

- `apps/api/src/modules/price-lists/price-lists.controller.ts` expone consulta, actualización de ítems y aprobación, pero no alta/edición del encabezado ni desactivación.
- `apps/api/prisma/schema.prisma` define `PriceListItem` único por `priceListId + presentationId`; `PriceList.currency` es de la lista y el cliente ya tiene `currency`.
- `apps/api/src/modules/pricing/pricing.service.ts` resuelve el precio desde la lista asignada al cliente y filtra por lista activa/aprobada; actualmente no recibe el usuario comercial para limitar una tarifa especial.
- `QuoteItem` y `OrderItem` almacenan valores monetarios; la factura enlaza opcionalmente a un pedido y cartera calcula saldo desde valores de factura y pagos.
