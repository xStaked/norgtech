# Gastos Comerciales - Design Spec

**Date:** 2026-06-04
**Status:** Approved for implementation planning
**Scope:** Opcion 2: MVP operativo de gastos comerciales con reportes y exportacion desde el inicio.

## Summary

El CRM necesita un modulo para que los comerciales registren sus gastos de campo en el momento en que ocurren, cargando obligatoriamente el soporte de factura o recibo. El equipo administrativo, usando el rol existente `facturacion`, revisa esos gastos, pide correcciones cuando haga falta, aprueba, rechaza o marca como contabilizado. Direccion y administracion pueden consultar el consolidado por vendedor, categoria, estado y periodo.

El modulo nace como parte de la Fase 2 del CRM comercial expandido. No reemplaza una integracion contable formal todavia, pero si debe producir informacion descargable y confiable para que contabilidad pueda procesarla sin esperar a fin de mes.

## Goals

- Permitir que un comercial registre gastos diarios de campo sin esperar a cierre mensual.
- Exigir soporte adjunto para todos los gastos.
- Guardar soportes en Cloudflare R2 privado, no en almacenamiento local.
- Permitir revision administrativa con estados claros y motivo de correccion o rechazo.
- Dar visibilidad mensual por comercial, categoria y estado.
- Exportar los gastos filtrados en CSV/XLSX para contabilidad.

## Non Goals

- No construir integracion directa con software contable en esta fase.
- No automatizar OCR ni lectura inteligente de facturas en esta fase.
- No registrar impuestos, retenciones o causacion contable detallada.
- No crear un rol nuevo `contabilidad`; se usara `facturacion`.
- No habilitar registro por WhatsApp/Nora en esta primera entrega.

## Users And Permissions

### Comercial

- Crea gastos propios.
- Ve solo sus gastos.
- Puede editar gastos en `pendiente` o `requiere_correccion`.
- Puede reenviar a revision un gasto corregido.
- Puede ver el soporte de sus propios gastos.

### Facturacion

- Ve todos los gastos.
- Revisa soportes.
- Cambia estado a `aprobado`, `rechazado`, `requiere_correccion` o `contabilizado`.
- Debe escribir motivo cuando rechaza o solicita correccion.
- Puede exportar gastos filtrados.

### Director Comercial / Administrador

- Ve todos los gastos y reportes.
- Puede exportar gastos filtrados.
- Puede cambiar estados igual que `facturacion`, porque son roles de control operativo.

## Expense Categories

Categorias iniciales:

- `alimentacion`
- `transporte`
- `hospedaje`
- `combustible`
- `peajes`
- `parqueadero`
- `atencion_comercial`
- `otros`

Las etiquetas visibles seran: Alimentacion, Transporte, Hospedaje, Combustible, Peajes, Parqueadero, Cliente / atencion comercial y Otros.

## Status Flow

Estados:

- `pendiente`: gasto creado y enviado a revision.
- `requiere_correccion`: facturacion devuelve el gasto por soporte, monto, categoria o descripcion.
- `aprobado`: gasto aceptado por revision administrativa.
- `rechazado`: gasto no aceptado definitivamente.
- `contabilizado`: gasto aprobado y procesado por contabilidad/facturacion.

Transiciones permitidas:

- `pendiente` -> `aprobado`
- `pendiente` -> `requiere_correccion`
- `pendiente` -> `rechazado`
- `requiere_correccion` -> `pendiente`
- `aprobado` -> `contabilizado`

Un gasto `rechazado` o `contabilizado` no se edita desde el flujo normal.

## Data Model

### CommercialExpense

Campos esperados:

- `id`
- `expenseDate`
- `category`
- `amount`
- `currency` con valor inicial `COP`
- `description`
- `status`
- `reviewNote`
- `reviewedAt`
- `reviewedByUserId`
- `submittedByUserId`
- `customerId` opcional
- `visitId` opcional
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

Reglas:

- `amount` debe ser mayor que cero.
- `description` es obligatoria.
- `customerId` y `visitId` son opcionales.
- Si se asocia `visitId`, el sistema puede mostrar el cliente derivado de la visita, pero no debe obligar a que todos los gastos pertenezcan a una visita.

### CommercialExpenseSupport

Campos esperados:

- `id`
- `expenseId`
- `bucket`
- `objectKey`
- `fileName`
- `contentType`
- `sizeBytes`
- `checksum` opcional
- `uploadedByUserId`
- `createdAt`

Reglas:

- Todo gasto debe tener al menos un soporte para ser creado.
- Para MVP se permite un soporte por gasto.
- Tipos permitidos: imagenes (`image/jpeg`, `image/png`, `image/webp`) y PDF (`application/pdf`).
- Tamano maximo recomendado: 10 MB por soporte.

## Storage

Los soportes se guardan en Cloudflare R2 privado.

Variables de entorno esperadas:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ENDPOINT`

El backend sube archivos a R2 y guarda `objectKey` en base de datos. El frontend no recibe URLs publicas permanentes. Para visualizar o descargar un soporte, el CRM expone un endpoint autenticado que valida permisos y devuelve un stream o una URL firmada de corta duracion.

## API

Endpoints propuestos:

- `POST /commercial-expenses`
- `GET /commercial-expenses`
- `GET /commercial-expenses/:id`
- `PATCH /commercial-expenses/:id`
- `PATCH /commercial-expenses/:id/status`
- `GET /commercial-expenses/:id/supports/:supportId`
- `GET /commercial-expenses/export`
- `GET /commercial-expenses/summary`

Filtros de listado y exportacion:

- `status`
- `category`
- `submittedByUserId`
- `from`
- `to`
- `customerId`
- `visitId`

Permisos:

- Comerciales solo consultan y modifican gastos propios.
- Facturacion, director comercial y administrador consultan todos.
- Cambio de estado queda restringido a facturacion, director comercial y administrador.

## Frontend

### Navigation

Agregar `Gastos` en el grupo `Operacion`.

Roles visibles:

- `administrador`
- `director_comercial`
- `comercial`
- `facturacion`

### List Page

Ruta: `/expenses`. La etiqueta visible sera `Gastos`. El API mantiene el nombre de dominio `/commercial-expenses` para evitar ambiguedad con gastos no comerciales futuros.

Contenido:

- Header: "Gastos comerciales".
- Accion principal: "Nuevo gasto".
- Tarjetas de resumen: Pendientes, En correccion, Aprobados, Contabilizados, total del periodo.
- Filtros: periodo, estado, categoria, comercial, cliente.
- Tabla: fecha, comercial, categoria, monto, cliente/visita, estado, soporte, acciones.
- Accion de exportar CSV/XLSX para roles de control.

### Create / Edit

Formulario:

- Fecha del gasto.
- Categoria.
- Monto.
- Descripcion.
- Cliente opcional.
- Visita opcional.
- Soporte obligatorio.

Validacion:

- No se puede guardar sin archivo.
- No se puede guardar monto menor o igual a cero.
- El archivo debe ser imagen o PDF.

### Detail / Review

Vista de detalle:

- Datos del gasto.
- Soporte embebido o enlace autenticado.
- Historial basico de estado.
- Motivo de correccion/rechazo si existe.
- Acciones de revision para roles autorizados.

## Reports And Export

El modulo incluye resumen desde la primera fase:

- Total por categoria.
- Total por comercial.
- Total por estado.
- Total por mes o periodo filtrado.

Exportacion:

- CSV y XLSX desde la primera entrega.
- La exportacion debe respetar permisos y filtros.
- Columnas: fecha, comercial, categoria, monto, moneda, cliente, visita, estado, descripcion, nota de revision, fecha de revision, revisor, fecha de creacion.

## Audit And Compliance

Registrar auditoria para:

- Creacion de gasto.
- Edicion de gasto.
- Cambio de estado.
- Solicitud de correccion.
- Rechazo.
- Marcado como contabilizado.

Los soportes no deben quedar publicos. Ninguna URL publica permanente debe almacenarse ni exponerse en la interfaz.

## Error Handling

- Si falla subida a R2, no se crea el gasto.
- Si falla la base de datos despues de subir a R2, el backend intentara borrar el objeto subido o dejara registro suficiente para limpieza posterior.
- Si falta configuracion R2, el backend debe responder error claro y no aceptar gastos.
- Si un comercial intenta abrir soporte de otro comercial, responder 403.
- Si el archivo supera tamano o tipo permitido, responder 400.

## Testing

Backend:

- Crear gasto con soporte obligatorio.
- Rechazar creacion sin soporte.
- Validar permisos por rol.
- Validar transiciones de estado.
- Validar filtros de listado.
- Validar resumen por categoria/vendedor/estado.
- Validar exportacion.
- Mockear R2 en tests.

Frontend:

- Comercial puede crear gasto con archivo.
- Comercial no ve gastos ajenos.
- Facturacion ve cola completa y cambia estados.
- Correccion devuelve gasto al comercial.
- Exportacion aparece solo para roles autorizados.

## Rollout

1. Configurar variables R2 en entorno.
2. Migrar base de datos con modelos de gastos y soportes.
3. Activar API y permisos.
4. Agregar navegacion y pantallas web.
5. Probar con usuarios demo: comercial, facturacion, director.
6. Validar exportacion con un periodo de prueba.

## Open Future Work

- OCR de facturas.
- Registro por WhatsApp/Nora con foto enviada desde campo.
- Politicas por categoria y limites de monto.
- Integracion contable directa.
- Separar rol `contabilidad` si la operacion lo requiere.
