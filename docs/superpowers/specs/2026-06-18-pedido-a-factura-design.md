# Pedido a factura automatico

## Contexto

El CRM ya tiene pedidos, empresas facturadoras, facturas, pagos, cartera, cupo de credito y auditoria. Hoy el equipo puede crear facturas manualmente y asociarlas a un pedido con `orderId`, pero falta una accion directa para convertir un pedido operativo en una factura consistente, sin volver a digitar cliente, empresa, totales ni vencimiento.

Este alcance no depende del contrato de confidencialidad ni de archivos reales de clientes/productos. Tampoco incluye importadores, devoluciones, inventario o remisiones.

## Objetivo

Permitir que `facturacion`, `administrador` y `director_comercial` generen una factura desde el detalle de un pedido con un solo flujo controlado. La factura debe quedar asociada al pedido, usar la empresa facturadora del pedido, calcular vencimiento segun el cliente y evitar duplicados activos.

## No objetivos

- No crear modulo de inventario ni validar stock.
- No crear devoluciones, notas credito ni ajustes negativos.
- No crear remisiones como documento separado.
- No importar pedidos, clientes, productos o listas de precios desde Excel.
- No reemplazar el modulo de facturas existente.
- No permitir multiples facturas activas para el mismo pedido en esta fase.

## Roles y permisos

Pueden generar factura desde pedido:

- `administrador`
- `director_comercial`
- `facturacion`

El rol `comercial` puede ver el resultado si ya tiene acceso al pedido/factura, pero no ejecuta la conversion.

## Backend

Agregar endpoint:

`POST /orders/:id/invoice`

Responsabilidad del endpoint:

1. Buscar el pedido con cliente, empresa, items y facturas existentes.
2. Validar que el pedido exista.
3. Validar que el pedido tenga `companyId`, `customerId` e items.
4. Validar que no exista una factura asociada al pedido con estado diferente de `anulada`.
5. Calcular `subtotal`, `taxAmount` y `totalAmount` desde los items del pedido:
   - `subtotal`: suma de `OrderItem.subtotal`.
   - `taxAmount`: suma de `OrderItem.taxAmount * quantity`.
   - `totalAmount`: usar `Order.total` cuando la diferencia contra la suma de `OrderItem.totalWithTax` sea menor o igual a 1 COP; si la diferencia es mayor, usar la suma de items y registrar el valor original del pedido en auditoria.
6. Generar `invoiceNumber` con el prefijo de la empresa, reutilizando la misma logica de consecutivo del modulo de facturas.
7. Calcular `issueDate` como fecha actual.
8. Calcular `dueDate` con `customer.paymentDays`; si no existe, usar 0 dias.
9. Ejecutar validacion de cupo actual antes de crear la factura.
10. Crear la factura con `orderId`, `customerId`, `companyId`, `subtotal`, `taxAmount`, `totalAmount`, `totalPaid = 0`, `status = emitida`.
11. Cambiar el pedido a `facturado` cuando su estado actual sea anterior a `facturado`.
12. Registrar auditoria para la factura creada y para el cambio de estado del pedido si aplica.
13. Devolver la factura creada con relaciones basicas para que el frontend pueda redirigir.

Estados permitidos para generar factura:

- `orden_facturacion`
- `facturado`
- `despachado`
- `entregado`

Si el pedido ya esta `facturado`, `despachado` o `entregado`, se permite generar la factura solo si no hay factura activa asociada. El estado del pedido no retrocede.

## Errores

El endpoint debe devolver errores claros para estos casos:

- Pedido no encontrado.
- Pedido sin empresa facturadora.
- Pedido sin cliente.
- Pedido sin items.
- Pedido en estado no facturable.
- Ya existe una factura activa para ese pedido.
- Empresa inactiva o no encontrada.
- Cupo de credito excedido.

## Frontend

En `orders/[id]`:

1. Mostrar una accion `Generar factura` para roles autorizados.
2. Ocultar o deshabilitar la accion si ya existe una factura activa asociada.
3. Al ejecutar la accion, llamar `POST /orders/:id/invoice`.
4. Mientras procesa, mostrar estado de carga y evitar doble envio.
5. Si responde bien, redirigir a `/invoices/:invoiceId`.
6. Si falla, mostrar el mensaje del backend.
7. Mantener visible el historial de facturacion asociado al pedido.

No se agrega una pantalla intermedia editable en esta fase. Si el equipo necesita corregir datos contables, lo hace despues desde el modulo de facturas existente.

## Datos y consistencia

La factura copia montos calculados desde el pedido en el momento de conversion. Cambios posteriores al pedido no modifican automaticamente la factura.

La restriccion de "una factura activa por pedido" se implementa en servicio con una consulta previa dentro de transaccion. Si en el futuro se requieren facturas parciales, este flujo debera cambiar para permitir saldos por item o porcentaje.

## Auditoria

Registrar:

- `invoice.created_from_order` con la factura creada.
- `order.status_changed` si el pedido cambia a `facturado`.

La auditoria debe incluir `actorUserId` del usuario que ejecuto la accion.

## Pruebas

Backend e2e:

- Crear factura desde pedido facturable.
- Bloquear factura duplicada para un pedido con factura activa.
- Permitir nueva factura si la factura anterior esta `anulada`.
- Calcular `dueDate` con `paymentDays`.
- Cambiar pedido de `orden_facturacion` a `facturado`.
- No retroceder pedido si ya esta `despachado` o `entregado`.
- Bloquear roles no autorizados.

Frontend e2e:

- Boton visible para `facturacion` en pedido facturable.
- Boton oculto o deshabilitado cuando existe factura activa.
- Redireccion a detalle de factura tras crearla.

## Criterios de aceptacion

- Facturacion puede abrir un pedido y generar una factura sin redigitar datos.
- La factura queda asociada al pedido y usa la empresa correcta.
- No se pueden crear dos facturas activas para el mismo pedido.
- El pedido pasa a `facturado` cuando corresponde.
- Los errores son visibles en UI.
- Las pruebas backend del flujo pasan.
