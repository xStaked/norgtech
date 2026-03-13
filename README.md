# AquaData MVP

Plataforma acuicola digital construida con Next.js y Supabase para centralizar operacion de granjas, captura de datos productivos, analitica, costos, alertas y herramientas de apoyo como OCR e indicadores FCA.

## Que incluye hoy

- Autenticacion y perfiles por organizacion con Supabase Auth.
- Dashboard operativo para productores y modulo administrativo.
- Gestion de estanques, lotes, registros productivos y costos.
- Carga de reportes con OCR asistido por IA.
- Herramienta de bioremediacion y seguimiento de alertas.
- Sincronizacion de precios de mercado para especies acuicolas.

## Stack

- Next.js 16 con App Router
- React 19
- TypeScript strict
- Tailwind CSS + componentes UI estilo shadcn
- Supabase (Auth, Postgres, RLS)
- Vercel AI SDK con proveedor activo en `lib/ai/provider.ts`

## Requisitos

- Node.js 20 o superior
- `pnpm`
- Proyecto de Supabase configurado
- Una clave de proveedor de IA si se usa OCR

## Instalacion

1. Instala dependencias:

```bash
pnpm install
```

2. Crea un archivo `.env.local` en la raiz.

3. Agrega las variables necesarias:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=http://localhost:3000/dashboard
```

Notas:

- `GOOGLE_GENERATIVE_AI_API_KEY` es necesaria con la configuracion actual del OCR porque el proveedor activo es `google`.
- Si cambias el proveedor en `lib/ai/provider.ts`, ajusta tambien las credenciales requeridas.
- `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` se usa en el flujo de registro.

## Base de datos

Los scripts SQL estan en `scripts/` y deben ejecutarse en orden sobre tu proyecto Supabase.

Orden sugerido:

1. `scripts/001_create_schema.sql`
2. `scripts/002_seed_demo_data.sql`
3. `scripts/003_market_prices_table.sql`
4. `scripts/004_sales_module.sql`
5. `scripts/005_water_quality_fields.sql`
6. `scripts/006_fish_count.sql`
7. `scripts/007_farm_name_signup.sql`
8. `scripts/008_avg_weight_kg.sql`
9. `scripts/008_invitation_codes.sql`
10. `scripts/009_pond_sort_order.sql`
11. `scripts/010_admin_module.sql`
12. `scripts/011_phone_signup.sql`
13. `scripts/012_default_fca_settings.sql`
14. `scripts/013_feed_record_stage.sql`

El esquema base crea, entre otras, estas entidades:

- `organizations`
- `profiles`
- `ponds`
- `batches`
- `uploads`
- `production_records`
- `bioremediation_calcs`

Tambien define politicas RLS y un trigger para crear el perfil del usuario en el alta.

## Desarrollo

Desde la raiz del proyecto:

```bash
pnpm dev
```

La app queda disponible en `http://localhost:3000`.

## Scripts utiles

```bash
pnpm dev
pnpm lint
pnpm build
pnpm start
```

## Validacion minima

Antes de cerrar cambios:

```bash
pnpm lint
pnpm build
```

Y valida manualmente los flujos impactados en desarrollo.

## Estructura del proyecto

```text
app/          rutas, layouts y API routes
components/   componentes de producto y UI compartida
hooks/        hooks reutilizables
lib/          integraciones, utilidades y acceso a datos
public/       assets estaticos
scripts/      migraciones y semillas SQL
styles/       estilos globales adicionales
docs/         documentacion funcional
```

## Flujos importantes

### OCR de reportes

- Endpoint: `app/api/ocr/route.ts`
- Extrae datos productivos desde imagenes de reportes de campo.
- Devuelve estructura validada con Zod y nivel de confianza por campo.

### Precios de mercado

- Endpoint: `app/api/market-prices/sync/route.ts`
- Sincroniza precios de referencia acuicola y los persiste en Supabase.
- Requiere usuario autenticado.

### Registro de usuarios

- Ruta: `app/auth/sign-up/page.tsx`
- El registro usa codigo de invitacion, nombre de granja, telefono y email.

## Roles y acceso

La aplicacion separa experiencias al menos para:

- `admin`
- `operario`

La ruta raiz redirige automaticamente a `/admin`, `/dashboard` o `/auth/login` segun el usuario autenticado.

## Observaciones

- El nombre actual del paquete en `package.json` sigue como `my-project`; si el proyecto ya va a publicarse o compartirse, conviene renombrarlo a algo coherente con AquaData.
- El repositorio no tiene framework de tests automatizados configurado todavia.

