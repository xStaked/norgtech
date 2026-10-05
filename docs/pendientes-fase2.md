# Pendientes Fase 2 — Reunión de entrega

Acordado con cliente final. No bloquea entrega.

## 1. Módulo de gestión de listas de precios
**Problema:** hoy las listas solo se crean vía script (`prisma/scripts/import-catalog.ts`
desde el Excel, cada hoja = una lista). No hay `POST /price-lists` ni pantalla admin.
El selector en cliente ya agrupa/sugiere (commit `2011177`), pero el admin no puede
crear, clonar ni auditar listas desde la UI.
**Alcance propuesto:**
- `POST /price-lists` + `PATCH /price-lists/:id` (solo `administrador`, `director_comercial`).
- Pantalla `Productos > Listas`: ver todas con dueño real (`priceListOwner`), moneda/país,
  nº clientes e ítems; marcar huérfanas `cliente` sin cliente.
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
