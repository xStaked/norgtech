# Cliente ↔ empresa y visibilidad de días de pago

Fecha: 2026-07-21

## Problema

Tras importar las 518 filas del listado que entregó el cliente, quedaron dos huecos:

1. **Días de pago invisible.** El dato ya existe end-to-end (`Customer.paymentCondition`,
   `Customer.paymentDays`, DTOs, formulario de edición) y ya viene poblado del Excel: 63
   clientes con crédito (44×30d, 10×60d, 8×15d, 1×90d) y 455 de contado. Pero no se ve en
   ninguna pantalla salvo el formulario de edición, así que no se puede comparar cartera sin
   entrar cliente por cliente.

2. **Cliente sin empresa.** Norgtech opera dos razones sociales (Norgtech y Nanonutrición) y
   el Excel trae una hoja por cada una. `Order`, `BillingRequest` e `Invoice` ya tienen
   `companyId`, pero `Customer` no, así que nada impide emitir una factura de Nanonutrición a
   un cliente de Norgtech.

## Alcance

Cambia el modelo de `Customer`, la validación de creación de órdenes, la lista de clientes, el
formulario de cliente y el script de import. No toca precios, metas ni WhatsApp.

## Decisiones

### Un cliente pertenece a una sola empresa

`Customer.companyId` es obligatorio (`String`, no nullable). Se descartó una tabla intermedia
N:M porque contradice la decisión ya tomada de subir el listado tal cual: SOLUCIONES NATURALES
AGROPECUARIAS aparece en las dos hojas y hoy son dos registros separados (`901145555-7` de
NORGTECH y `901145555` de Nanonutrición). Se quedan separados.

Nullable se descartó porque un cliente sin empresa esquivaría la validación de órdenes.

Consecuencia aceptada: si un cliente empieza a comprarle a la otra empresa, hay que crearlo de
nuevo. Es el caso raro y ya está representado así en los datos.

### La empresa del cliente restringe la facturación

`OrdersService.create` rechaza con `400` si `dto.companyId !== customer.companyId`. Se aplica el
mismo guard en cualquier otro camino que fije o cambie `Order.companyId`.

Motivo: emitir una factura con la razón social equivocada es un problema tributario, no
cosmético. Se prefirió bloquear sobre preseleccionar.

### Días de pago reemplaza la columna Crédito

La lista de clientes ya tiene 7 columnas y la de `Crédito` muestra `creditLimit`, que está
vacío en los 518 importados: hoy es una columna de guiones. Pasa a mostrar la condición de pago
("Contado", "Crédito 30 días") con el cupo debajo en letra pequeña cuando exista.

La empresa se muestra como subtítulo dentro de la celda "Cliente", no como columna nueva.

## Cambios

### Modelo

```prisma
model Customer {
  companyId String
  company   Company @relation(fields: [companyId], references: [id])
}

model Company {
  customers Customer[]
}
```

Migración en tres pasos, para no romper las filas existentes:

1. `ALTER TABLE "Customer" ADD COLUMN "companyId" TEXT` (nullable)
2. Backfill desde `notes`, que ya registra la hoja de origen:
   - `notes LIKE '%hoja NORGTECH%'` → Norgtech (506 filas)
   - `notes LIKE '%hoja Nanonutrición%'` → Nanonutrición (12 filas)
3. `SET NOT NULL` + FK

El paso 3 falla si quedó alguna fila sin empresa, lo cual es el comportamiento deseado: es la
señal de que el backfill no cubrió todo.

### Datos maestros

- Crear `Company` Nanonutrición: NIT `902040575-6` (DV verificado contra el algoritmo DIAN).
  **Supuestos a confirmar con el cliente:** razón social `Nanonutrición S.A.S.` y prefijo de
  facturación `NN`. El prefijo numera las facturas, así que corregirlo después de emitir la
  primera es costoso.
- Borrar las 3 empresas de prueba (`Empresa de prueba`, `Empresa inactiva`, `Empresa prueba`).
  No quedan órdenes ni facturas referenciándolas.

### API

- `create-customer.dto.ts`: `companyId` requerido.
- `update-customer.dto.ts`: `companyId` opcional. Cambiar la empresa de un cliente que ya tiene
  órdenes se rechaza con `400`: dejaría órdenes cuya empresa ya no coincide con la del cliente,
  justo el estado que la validación busca impedir.
- `customers.service.ts`: incluir `company` en las lecturas que alimentan la lista.
- `orders.service.ts`: guard de empresa descrito arriba.

### Web

- `customers/page.tsx`: columna `Crédito` → `Pago`; empresa como subtítulo de la celda Cliente.
- `customer-form.tsx`: selector de empresa, requerido, poblado de `/companies`.

### Script de import

`import-customers.ts` resuelve la empresa por hoja y aborta si no la encuentra, en vez de
importar a medias. Sigue siendo idempotente.

## Pruebas

- `import-customers.check.ts`: extender con el mapeo hoja → empresa.
- e2e: crear orden con empresa que no coincide con la del cliente → 400; con la que coincide →
  201. Mismo par para el camino de actualización si permite cambiar empresa.

## Riesgos

- **El prefijo `NN` es un supuesto.** Si el cliente usa otro, hay que corregirlo antes de la
  primera factura de Nanonutrición.
- **El backfill depende del texto de `notes`.** Solo funciona para las filas que insertó el
  import. Cualquier cliente creado a mano antes de la migración quedaría sin empresa y haría
  fallar el `SET NOT NULL`. Hoy no existe ninguno (la tabla tiene exactamente las 518 del
  Excel), pero hay que verificarlo al momento de migrar.
