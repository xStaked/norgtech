# Norgtech Platform — Roadmap de Implementación

> SaaS vertical para el sector avícola y porcino.
> Plataforma interna para Norgtech: gestión de productores, casos técnicos, visitas, calculadoras y AI.

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────┐
│                    MONOREPO norgtech/                    │
│                                                         │
│  frontend/          backend/           shared/          │
│  Next.js 16         NestJS             Types TS         │
│  App Router         Modular            DTOs             │
│  shadcn/ui          REST API           Zod schemas      │
│  Tailwind           Guards/Pipes                        │
│                     Prisma ORM                          │
│                                                         │
│  Portal Admin       ←─── API ───→      Supabase DB      │
│  Portal Cliente                        (PostgreSQL)     │
└─────────────────────────────────────────────────────────┘
```

### Dos portales en el mismo Next.js (route groups)

```
app/
  (admin)/           → Panel interno Norgtech
    dashboard/       → Solo roles: admin, asesor_tecnico, asesor_comercial
    clients/
    cases/
    visits/
    calculators/
    knowledge/
    assistant/
    settings/

  (portal)/          → Portal del productor (cliente externo)
    dashboard/       → Solo rol: cliente
    my-cases/
    my-farm/
    recommendations/
```

### Stack definitivo

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 · React 19 · TypeScript |
| UI | Tailwind CSS · shadcn/ui |
| Backend API | **NestJS** (modular) |
| ORM | **Prisma** → conecta a Supabase PostgreSQL |
| Auth | Supabase Auth (JWT) → validado en NestJS Guard |
| AI | **DeepSeek API** (vía Vercel AI SDK o directo) |
| Storage | Supabase Storage |
| Deploy Frontend | Vercel |
| Deploy Backend | VPS / Railway / Render con Docker |
| DB | Supabase PostgreSQL |

---

## Roles

| Rol | Acceso | Descripción |
|-----|--------|-------------|
| `admin` | Panel Admin (full) | Gestión total del sistema |
| `asesor_tecnico` | Panel Admin | Gestión de casos, visitas, calculadoras |
| `asesor_comercial` | Panel Admin | CRM, seguimiento comercial |
| `cliente` | Portal Cliente | Ver sus casos, granjas y recomendaciones |

---

## Estructura de directorios objetivo

```
norgtech/
├── frontend/                    # Next.js (ya existe, se adapta)
│   ├── app/
│   │   ├── (admin)/
│   │   ├── (portal)/
│   │   └── api/                 # Solo proxies ligeros al backend NestJS
│   ├── components/
│   ├── lib/
│   │   ├── api/                 # Clientes HTTP hacia NestJS
│   │   └── supabase/            # Solo auth (client/server)
│   └── ...
│
├── backend/                     # NestJS (nuevo)
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/
│   │   │   ├── guards/          # SupabaseAuthGuard, RolesGuard
│   │   │   ├── decorators/      # @Roles(), @CurrentUser()
│   │   │   └── pipes/
│   │   ├── prisma/              # PrismaModule + PrismaService
│   │   ├── auth/                # AuthModule (validación JWT Supabase)
│   │   ├── tenants/             # TenantModule
│   │   ├── clients/             # ClientsModule (productores)
│   │   ├── farms/               # FarmsModule (granjas)
│   │   ├── cases/               # CasesModule (ticketing)
│   │   ├── visits/              # VisitsModule (visitas técnicas)
│   │   ├── calculators/         # CalculatorsModule (FCA, ROI)
│   │   ├── knowledge/           # KnowledgeModule (base de conocimiento)
│   │   └── ai/                  # AIModule (DeepSeek assistant)
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
│
├── shared/                      # Tipos compartidos (opcional Fase tardía)
└── ROADMAP.md
```

---

## Convenciones

- **Frontend:** Server Actions solo para auth; todo lo demás llama al NestJS API
- **Backend:** Cada módulo NestJS tiene `controller`, `service`, `dto`, `entity`
- **DTOs:** Validados con `class-validator` en NestJS
- **Auth flow:** Supabase emite JWT → NestJS `SupabaseAuthGuard` lo verifica → extrae user + role
- **Multi-tenant:** Todo endpoint filtra por `organizationId` del JWT
- **UI:** Español en toda la interfaz

---

## Fases de Implementación

---

### FASE 0 — Monorepo setup y configuración base
**Objetivo:** Estructura del monorepo lista, NestJS bootstrapped, Prisma conectado.
**Agente:** 1 agente
**Bloqueante para:** Todo lo demás

#### Tareas

**0.1 — Estructura de monorepo**
- [x] Crear `backend/` con NestJS (`nest new backend --package-manager pnpm`)
- [x] Crear `pnpm-workspace.yaml` en raíz
- [x] Scripts en `package.json` raíz: `dev:frontend`, `dev:backend`, `dev` (ambos)

**0.2 — NestJS base**
- [x] Instalar dependencias: `@nestjs/config`, `@nestjs/swagger`, `class-validator`, `class-transformer`
- [x] Configurar `AppModule` con `ConfigModule.forRoot()`
- [x] Setup CORS en `main.ts` (aceptar desde frontend URL)
- [x] Setup `ValidationPipe` global
- [x] Setup Swagger en `/api/docs`

**0.3 — Prisma + Supabase**
- [x] Instalar Prisma en `backend/`
- [x] Configurar `DATABASE_URL` apuntando a Supabase PostgreSQL (connection pooling via Supavisor)
- [x] Crear `PrismaModule` y `PrismaService` (singleton global)
- [x] `prisma db pull` para introspeccionar schema existente (tablas de acuicultura)

**0.4 — Auth Guard**
- [x] Crear `SupabaseAuthGuard`: verifica JWT de Supabase, extrae `userId` + `role` + `organizationId`
- [x] Crear decorador `@CurrentUser()` para inyectar usuario en controllers
- [x] Crear decorador `@Roles(...roles)` + `RolesGuard`
- [x] Aplicar `SupabaseAuthGuard` globalmente, `@Public()` para rutas abiertas

**0.5 — Frontend adaptaciones base**
- [x] Crear `frontend/lib/api/client.ts` — fetch wrapper hacia NestJS con JWT en headers
- [x] Actualizar roles en `frontend/lib/auth/roles.ts`: `admin`, `asesor_tecnico`, `asesor_comercial`, `cliente`
- [x] Actualizar `frontend/app/globals.css` — paleta Norgtech (verde oscuro `#1a3a2a` + naranja `#f97316`)
- [x] Limpiar sidebar y navegación del código de acuicultura
- [x] Crear route groups: `app/(admin)/` y `app/(portal)/`
- [x] Crear middlewares de protección por rol para cada route group

**Variables de entorno `backend/.env`:**
```env
DATABASE_URL=postgresql://...  # Supabase connection string (pooled)
DIRECT_URL=postgresql://...    # Supabase direct (para migraciones)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=     # Para verificar JWTs server-side
DEEPSEEK_API_KEY=
PORT=4000
FRONTEND_URL=http://localhost:3000
```

---

### FASE 1 — Schema de base de datos
**Objetivo:** Schema Prisma completo del nuevo dominio. Migraciones aplicadas.
**Agente:** 1 agente
**Bloqueante para:** Fases 2, 3, 4, 5, 7, 8

#### Schema Prisma completo (`backend/prisma/schema.prisma`)

```prisma
// Entidades existentes (ya en Supabase, se conservan para auth)
// organizations, profiles — NO se recrean, se referencian

model Client {
  id               String    @id @default(uuid())
  organizationId   String
  fullName         String
  phone            String?
  email            String?
  companyName      String?
  address          String?
  assignedAdvisorId String?
  status           String    @default("active") // active | inactive
  notes            String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  farms            Farm[]
  cases            Case[]
  visits           TechnicalVisit[]
}

model Farm {
  id               String    @id @default(uuid())
  clientId         String
  organizationId   String
  name             String
  speciesType      String    // poultry | swine
  location         String?
  capacity         Int?
  assignedAdvisorId String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  client           Client    @relation(fields: [clientId], references: [id])
  cases            Case[]
  visits           TechnicalVisit[]
  fcaCalcs         FcaCalculation[]
  roiCalcs         RoiCalculation[]
}

model Case {
  id               String    @id @default(uuid())
  organizationId   String
  clientId         String
  farmId           String?
  caseNumber       Int       @unique
  title            String
  description      String?
  severity         String    @default("medium") // low | medium | high | critical
  status           String    @default("open")   // open | in_analysis | treatment | waiting_client | closed
  assignedTechId   String?
  source           String    @default("manual") // manual | ai
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  closedAt         DateTime?

  client           Client    @relation(fields: [clientId], references: [id])
  farm             Farm?     @relation(fields: [farmId], references: [id])
  messages         CaseMessage[]
}

model CaseMessage {
  id               String    @id @default(uuid())
  caseId           String
  userId           String
  content          String
  messageType      String    @default("note") // note | status_change | ai_suggestion
  createdAt        DateTime  @default(now())

  case             Case      @relation(fields: [caseId], references: [id])
}

model TechnicalVisit {
  id               String    @id @default(uuid())
  organizationId   String
  caseId           String?
  clientId         String
  farmId           String
  advisorId        String
  visitDate        DateTime
  // Campos avícola
  birdCount        Int?
  mortalityCount   Int?
  feedConversion   Float?
  avgBodyWeight    Float?
  // Campos porcino
  animalCount      Int?
  dailyWeightGain  Float?
  feedConsumption  Float?
  // General
  observations     String?
  recommendations  String?
  createdAt        DateTime  @default(now())

  client           Client    @relation(fields: [clientId], references: [id])
  farm             Farm      @relation(fields: [farmId], references: [id])
}

model FcaCalculation {
  id               String    @id @default(uuid())
  userId           String
  organizationId   String
  farmId           String?
  feedConsumedKg   Float
  birdWeightKg     Float
  mortalityCount   Int
  birdCount        Int
  feedCostPerKg    Float
  // outputs
  fcaResult        Float
  productionCost   Float
  estimatedLosses  Float
  potentialSavings Float
  createdAt        DateTime  @default(now())

  farm             Farm?     @relation(fields: [farmId], references: [id])
}

model RoiCalculation {
  id               String    @id @default(uuid())
  userId           String
  organizationId   String
  farmId           String?
  feedSavings      Float
  weightGainValue  Float
  additiveCost     Float
  // output
  roiPercentage    Float
  netValue         Float
  breakEven        Float
  createdAt        DateTime  @default(now())

  farm             Farm?     @relation(fields: [farmId], references: [id])
}

model KnowledgeArticle {
  id               String    @id @default(uuid())
  organizationId   String
  title            String
  content          String
  category         String    // product | protocol | training | sales_argument
  speciesType      String    @default("both") // poultry | swine | both
  tags             String[]
  isPublished      Boolean   @default(false)
  createdBy        String
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

#### Tareas
- [x] **1.1** Escribir `schema.prisma` completo con todos los modelos
- [x] **1.2** Crear secuencia para `caseNumber` autoincremental en PostgreSQL
- [x] **1.3** Crear índices: `organizationId` en todas las tablas, `status` en `Case`, `clientId` + `farmId`
- [x] **1.4** Ejecutar `prisma migrate dev --name norgtech_core`
- [x] **1.5** Generar tipos: `prisma generate`
- [x] **1.6** Seed básico: una organización de prueba, un admin, un asesor, un cliente de prueba

---

### FASE 2 — NestJS Core Modules (Auth + Tenant + Clients + Farms)
**Objetivo:** API REST funcional para CRM (productores y granjas).
**Agente:** 2 agentes en paralelo (2A: Clients · 2B: Farms)
**Dependencias:** Fase 0, Fase 1

#### Módulo Auth (`backend/src/auth/`)
- [x] `AuthController`: `GET /auth/me` → retorna perfil del usuario autenticado
- [x] Integración con tabla `profiles` de Supabase para obtener rol + organizationId

#### Módulo Clients (`backend/src/clients/`)

**Endpoints:**
```
GET    /clients                  → lista paginada (filter: status, advisorId, speciesType)
POST   /clients                  → crear productor
GET    /clients/:id              → detalle + granjas asociadas + casos recientes
PUT    /clients/:id              → editar
DELETE /clients/:id              → soft delete (status = inactive)
GET    /clients/:id/summary      → KPIs del productor (casos abiertos, visitas, etc.)
```

**DTOs:**
```typescript
CreateClientDto {
  fullName: string      // required
  phone?: string
  email?: string
  companyName?: string
  address?: string
  assignedAdvisorId?: string
  notes?: string
}
```

- [x] `ClientsModule` con controlador REST, DTOs validados y service multi-tenant
- [x] `GET /clients` con paginación y filtros por `status`, `advisorId` y `speciesType`
- [x] `POST /clients`, `GET /clients/:id`, `PUT /clients/:id`, `DELETE /clients/:id`
- [x] `GET /clients/:id/summary` con KPIs operativos del productor

#### Módulo Farms (`backend/src/farms/`)

**Endpoints:**
```
GET    /farms                    → lista (filter: clientId, speciesType, advisorId)
POST   /farms                    → crear granja
GET    /farms/:id                → detalle + historial de visitas
PUT    /farms/:id                → editar
GET    /farms/:id/stats          → métricas de la granja
```

**DTOs:**
```typescript
CreateFarmDto {
  clientId: string     // required
  name: string         // required
  speciesType: 'poultry' | 'swine'  // required
  location?: string
  capacity?: number
  assignedAdvisorId?: string
}
```

#### Frontend — Panel Admin CRM
```
app/(admin)/clients/
  page.tsx             → Server Component: lista productores
  new/page.tsx
  [id]/page.tsx        → Perfil del productor
  [id]/edit/page.tsx

app/(admin)/farms/
  page.tsx
  new/page.tsx
  [id]/page.tsx
```

- [x] `components/admin/farm-form.tsx` (selector especie avícola/porcino)
- [x] `components/admin/advisor-select.tsx`
- [x] `frontend/lib/api/farms.ts`
- [x] `app/(admin)/clients/page.tsx` — lista de productores con búsqueda y filtros
- [x] `app/(admin)/clients/new/page.tsx`
- [x] `app/(admin)/clients/[id]/page.tsx` — perfil del productor
- [x] `app/(admin)/clients/[id]/edit/page.tsx`
- [x] `components/admin/client-form.tsx`
- [x] `components/admin/client-card.tsx`
- [x] `frontend/lib/api/clients.ts` — funciones fetch hacia NestJS

---

### FASE 3 — Módulo de Casos Técnicos
**Objetivo:** Sistema de ticketing completo.
**Agente:** 1-2 agentes en paralelo (3A: backend · 3B: frontend)
**Dependencias:** Fase 1, Fase 2

#### Backend 3A — NestJS `CasesModule`

**Endpoints:**
```
GET    /cases                    → lista (filter: status, severity, assignedTechId, clientId, farmId)
POST   /cases                    → crear caso
GET    /cases/:id                → detalle + mensajes (timeline)
PUT    /cases/:id                → actualizar (status, severity, assignedTech)
POST   /cases/:id/messages       → agregar nota/mensaje al timeline
GET    /cases/stats              → conteos por status para dashboard
```

**DTOs:**
```typescript
CreateCaseDto {
  clientId: string
  farmId?: string
  title: string
  description?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  assignedTechId?: string
}

UpdateCaseStatusDto {
  status: 'open' | 'in_analysis' | 'treatment' | 'waiting_client' | 'closed'
  note?: string   // nota que va al timeline al cambiar estado
}

AddCaseMessageDto {
  content: string
  messageType: 'note' | 'ai_suggestion'
}
```

**Lógica especial:**
- `caseNumber` autoincremental por organización (CASO-0001, CASO-0002...)
- Al cambiar status → crear automáticamente un `CaseMessage` de tipo `status_change`
- `closedAt` se llena automáticamente al pasar a `closed`

- [x] Crear `backend/src/cases/` con `CasesModule`, `CasesController`, `CasesService` y DTOs validados
- [x] Implementar `GET /cases` con filtros por `status`, `severity`, `assignedTechId`, `clientId` y `farmId`
- [x] Implementar `POST /cases`, `GET /cases/:id` y `PUT /cases/:id`
- [x] Implementar `POST /cases/:id/messages` para timeline interno del caso
- [x] Implementar `GET /cases/stats` con conteos por estado para dashboard
- [x] Resolver numeración visible `CASO-0001` a partir de `caseNumber` por organización
- [x] Crear mensaje automático `status_change` al actualizar estado
- [x] Asignar `closedAt` automáticamente cuando el caso pase a `closed`
- [x] Aplicar aislamiento multi-tenant por `organizationId` en todos los endpoints

#### Frontend 3B
```
app/(admin)/cases/
  page.tsx             → lista con filtros + badges de severidad/status
  new/page.tsx
  [id]/page.tsx        → detalle: info del caso + timeline cronológico + formulario añadir nota
```

- [x] `app/(admin)/cases/page.tsx` — lista con filtros por estado, severidad, técnico y productor
- [x] `app/(admin)/cases/new/page.tsx`
- [x] `app/(admin)/cases/[id]/page.tsx` — detalle con timeline y panel de seguimiento
- [x] `components/admin/case-form.tsx`
- [x] `components/admin/case-timeline.tsx` — historial con íconos por tipo de mensaje
- [x] `components/admin/case-status-badge.tsx` — colores: rojo=critical, naranja=high, etc.
- [x] `components/admin/severity-selector.tsx`
- [x] `components/admin/case-detail-actions.tsx` — actualización de estado/severidad/asignación y nota interna
- [x] `frontend/lib/api/cases.ts` y `app/(admin)/cases/_lib/server-cases.ts`

---

### FASE 4 — Módulo de Visitas Técnicas
**Objetivo:** Registro de visitas a campo con indicadores productivos.
**Agente:** 1 agente
**Dependencias:** Fase 1, Fase 2

#### NestJS `VisitsModule`

**Endpoints:**
```
GET    /visits                   → lista (filter: advisorId, clientId, farmId, dateRange)
POST   /visits                   → registrar visita
GET    /visits/:id               → detalle
PUT    /visits/:id               → editar
GET    /visits/farm/:farmId      → historial de visitas de una granja
```

#### Frontend
```
app/(admin)/visits/
  page.tsx
  new/page.tsx
  [id]/page.tsx
```

- [x] `components/admin/visit-form.tsx` — campos condicionales por especie (avícola vs porcino)
- [x] `components/admin/visit-summary-card.tsx`

---

### FASE 5 — Calculadoras Técnicas
**Objetivo:** FCA, ROI y simulador de producción.
**Agente:** 2 agentes en paralelo (5A: backend+FCA · 5B: ROI+simulador)
**Dependencias:** Fase 1

**Avance actual:**
- [x] 5A — backend + frontend FCA
- [x] 5B — ROI + simulador

#### NestJS `CalculatorsModule`

**Endpoints:**
```
- [x] POST   /calculators/fca            → calcular FCA + guardar historial
- [x] GET    /calculators/fca            → historial de cálculos FCA del usuario
- [x] POST   /calculators/roi            → calcular ROI + guardar
- [x] GET    /calculators/roi            → historial ROI
- [x] POST   /calculators/production-sim → simulación (sin guardar, solo calcular)
```

- [x] `backend/src/calculators/*` — módulo NestJS con `POST /calculators/fca` y `GET /calculators/fca`

**Lógica FCA:**
```typescript
// ICA = kg alimento consumido / kg de ganancia total
// kg ganancia total = (aves_vivas_final * peso_promedio) - peso_inicial_estimado
// costo_produccion = (feed_consumed_kg * feed_cost_per_kg) / (bird_count * avg_weight)
// perdidas_estimadas = mortality_count * avg_weight * precio_mercado
```

**Lógica ROI:**
```typescript
// ROI% = ((feed_savings + weight_gain_value - additive_cost) / additive_cost) * 100
// net_value = feed_savings + weight_gain_value - additive_cost
// break_even = additive_cost / (feed_savings + weight_gain_value) * 100 (% del ciclo)
```

#### Frontend
```
app/(admin)/calculators/
  fca/page.tsx         → formulario + resultado visual + historial
  roi/page.tsx
  production-sim/page.tsx
```

- [x] `app/(admin)/admin/calculators/fca/page.tsx` — vista FCA con historial server-side
- [x] `components/calculators/fca-form.tsx` — formulario con validaciones
- [x] `components/calculators/fca-result.tsx` — resultado con gráfico de comparación benchmark
- [x] `app/(admin)/admin/calculators/roi/page.tsx` — ROI con historial server-side
- [x] `app/(admin)/admin/calculators/production-sim/page.tsx` — simulador operativo
- [x] `components/calculators/roi-result.tsx` — gauge de ROI + tabla de desglose
- [x] `components/calculators/production-sim-form.tsx` — selector programa (broiler/ponedora/cerdo)
- [x] `components/calculators/simulation-chart.tsx` — proyección semanal (Recharts LineChart)

---

### FASE 6 — Dashboards
**Objetivo:** KPIs y métricas en tiempo real para admin y asesores.
**Agente:** 1 agente
**Dependencias:** Fases 2, 3, 4

#### NestJS endpoints para dashboard
```
GET    /dashboard/admin-stats    → KPIs globales de la organización
GET    /dashboard/advisor-stats  → KPIs del asesor autenticado
```

- [x] Implementar `GET /dashboard/admin-stats`
- [x] Implementar `GET /dashboard/advisor-stats`

**Admin stats response:**
```typescript
{
  activeClients: number,
  openCases: number,
  casesByStatus: { open: n, in_analysis: n, treatment: n, waiting_client: n },
  avgResponseTimeHours: number,
  visitsThisMonth: number,
  advisorActivity: [{ advisorId, name, openCases, closedCases, visitsThisMonth }]
}
```

#### Frontend
```
app/(admin)/dashboard/
  page.tsx             → Dashboard admin (default para admin/asesores)
```

- [x] `components/admin/stats-card.tsx`
- [x] `components/admin/cases-donut-chart.tsx` (Recharts)
- [x] `components/admin/advisor-table.tsx`
- [x] `components/admin/recent-activity-feed.tsx`

---

### FASE 7 — Portal del Cliente
**Objetivo:** Portal de autoservicio para que los productores vean sus casos y granja.
**Agente:** 1 agente
**Dependencias:** Fases 2, 3, 4

#### Rutas portal cliente
```
app/(portal)/
  dashboard/page.tsx   → resumen: casos abiertos, última visita, recomendaciones pendientes
  my-cases/
    page.tsx           → mis casos (solo lectura)
    [id]/page.tsx      → detalle del caso + timeline
  my-farm/
    page.tsx           → info de mi granja + historial de visitas
```

**Restricciones:** El cliente solo ve datos asociados a su `clientId`. RLS en NestJS nivel servicio.

- [x] `components/portal/case-status-timeline.tsx` — versión simplificada para cliente
- [x] `components/portal/farm-overview.tsx`
- [x] `components/portal/visit-history-card.tsx`

---

### FASE 8 — Base de Conocimiento
**Objetivo:** Repositorio de documentación técnica para asesores + consulta por AI.
**Agente:** 1 agente
**Dependencias:** Fase 1

#### NestJS `KnowledgeModule`

**Endpoints:**
```
GET    /knowledge                → lista artículos (filter: category, speciesType, tags, search)
POST   /knowledge                → crear artículo
GET    /knowledge/:id            → leer artículo
PUT    /knowledge/:id            → editar
DELETE /knowledge/:id            → eliminar
POST   /knowledge/search         → búsqueda full-text por query string
```

#### Frontend
```
app/(admin)/knowledge/
  page.tsx
  new/page.tsx
  [id]/page.tsx
  [id]/edit/page.tsx
```

- [x] `components/admin/article-form.tsx` — editor con textarea markdown + preview
- [x] `components/admin/article-card.tsx`
- [x] `components/admin/knowledge-filters.tsx`

---

### FASE 9 — Asistente AI (DeepSeek)
**Objetivo:** Chat técnico con clasificación de intent y consulta a knowledge base.
**Agente:** 1 agente
**Dependencias:** Fase 8

#### AI Flow
```
Técnico escribe mensaje en chat
  → POST /ai/chat (NestJS)
  → Clasificar intent:
      "pregunta_tecnica" → buscar en knowledge base → responder con contexto
      "incidencia"       → extraer datos → sugerir creación de caso
      "recomendacion"    → buscar productos en knowledge base
  → Streaming response al frontend
```

#### NestJS `AIModule`

**Endpoints:**
```
POST   /ai/chat                  → streaming chat (SSE o stream)
POST   /ai/classify-intent       → solo clasificar (uso interno)
```

**Configuración DeepSeek:**
```typescript
// lib/ai/provider.ts — actualizar para DeepSeek
// DeepSeek es compatible con OpenAI SDK (misma API)
// baseURL: 'https://api.deepseek.com/v1'
// model: 'deepseek-chat' o 'deepseek-reasoner'
```

#### Frontend
```
app/(admin)/assistant/
  page.tsx             → chat UI con streaming
```

- [ ] `components/admin/chat-interface.tsx` — mensajes, input, streaming
- [ ] `components/admin/intent-badge.tsx` — badge visual del intent detectado
- [ ] Botón "Crear caso desde esta conversación" al detectar incidencia

---

## Orden de ejecución y paralelización

```
[FASE 0] Monorepo setup (bloqueante)
    ↓
[FASE 1] Schema DB + Prisma (bloqueante)
    ↓
┌─────────────────────────────┐
│  FASE 2    │  FASE 5    │  FASE 8  │   ← Paralelo (3 agentes)
│  CRM       │  Calcs     │  Know.   │
└─────────────────────────────┘
    ↓
┌────────────────────┐
│  FASE 3  │ FASE 4  │              ← Paralelo (2 agentes)
│  Casos   │ Visitas │
└────────────────────┘
    ↓
[FASE 6] Dashboards
    ↓
[FASE 7] Portal Cliente
    ↓
[FASE 9] AI Assistant
```

---

## Variables de entorno

### `backend/.env`
```env
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=
DEEPSEEK_API_KEY=
PORT=4000
FRONTEND_URL=http://localhost:3000
```

### `frontend/.env.local`
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:4000   # NestJS backend
```

---

## Criterios de MVP completado

- [ ] Monorepo funcional: `pnpm dev` levanta frontend + backend
- [ ] Auth con 4 roles (admin, asesor_tecnico, asesor_comercial, cliente)
- [ ] Panel admin: CRM completo de productores y granjas
- [ ] Casos técnicos: CRUD, timeline, cambios de estado
- [ ] Visitas técnicas registradas por asesor
- [ ] Calculadoras FCA y ROI con historial
- [ ] Base de conocimiento con búsqueda
- [ ] Portal cliente: ver sus casos y granjas
- [ ] Dashboard admin con KPIs
- [ ] Asistente AI con DeepSeek respondiendo consultas técnicas

---

## Notas para agentes

- **NO modificar** tablas `organizations`, `profiles`, `auth.*` — son de Supabase Auth
- **Prisma** se usa para todas las tablas nuevas. Las tablas auth se acceden via Supabase client
- Todo endpoint NestJS debe aplicar el `SupabaseAuthGuard` y filtrar por `organizationId`
- Los **Server Components** de Next.js llaman directamente al NestJS vía `fetch` con el JWT del cookie de Supabase
- UI siempre en **español**
- Usar `shadcn/ui` para todos los componentes, no reinventar
