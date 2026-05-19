# Nora WhatsApp Gateway — Implementation Plan

> **Goal:** Habilitar a Nora como agente de WhatsApp usando Kapso AI para la conexión con Meta API. Arquitectura basada en microservicio dedicado (WhatsApp Gateway) desplegada en VPS Hostinger KVM 2 (2vCPU, 8GB RAM, 100GB NVMe) con Dokploy.

**Architecture:** Un nuevo microservicio `apps/whatsapp-gateway/` (NestJS ligero) actúa como gateway dedicado entre Kapso/WhatsApp y el ecosistema interno. Recibe webhooks de Kapso, identifica al usuario por teléfono, enruta a Nora para procesamiento de IA, adapta la respuesta JSON de Nora a payloads de WhatsApp, y envía vía Kapso SDK. Nora permanece como servicio de IA puro sin conocer WhatsApp. La API NestJS (CRM) sigue siendo la fuente de verdad para identidad y operaciones de negocio.

**Tech Stack:** NestJS, `@kapso/whatsapp-cloud-api`, Prisma (schema compartido), Redis, FastAPI (Nora), PostgreSQL, Docker.

**Inbound-only:** Todos los mensajes son iniciados por el usuario (comercial) desde WhatsApp. Esto elimina la necesidad de templates aprobados por Meta y simplifica el manejo de la ventana de 24h.

**Infraestructura objetivo:**
- 2 vCPU / 8GB RAM / 100GB NVMe
- Servicios: Web (:3000), API (:3001), Gateway (:3002), Nora (:8000), PostgreSQL (:5432), Redis (:6379), Traefik (:80/:443)

---

## Fase 0: Infraestructura base y preparación

### Task 0.1: Agregar Redis al stack de desarrollo

**Objective:** Redis se usará para: (a) persistencia de sesiones de Nora (reemplaza MemorySaver), (b) caché de identidad teléfono→usuario, (c) posible cola de webhooks si hay burst.

**Files:**
- Modify: `docker-compose.yml` (nuevo, raíz del proyecto)
- Modify: `agents/nora/.env` (agregar REDIS_URL)

**Step 1: Crear `docker-compose.yml` en raíz**

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    container_name: norgtech-postgres
    environment:
      POSTGRES_USER: norgtech
      POSTGRES_PASSWORD: norgtech_dev
      POSTGRES_DB: norgtech
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: norgtech-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    container_name: norgtech-api
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://norgtech:norgtech_dev@postgres:5432/norgtech
      - PORT=3001
    depends_on:
      - postgres
      - redis

  nora:
    build:
      context: ./agents/nora
      dockerfile: Dockerfile
    container_name: norgtech-nora
    ports:
      - "8000:8000"
    environment:
      - NESTJS_API_URL=http://api:3001
      - REDIS_URL=redis://redis:6379/0
      - PORT=8000
    depends_on:
      - api
      - redis

volumes:
  postgres_data:
  redis_data:
```

**Step 2: Agregar REDIS_URL a `agents/nora/.env`**

```bash
REDIS_URL=redis://localhost:6379/0
```

**Step 3: Verificar Redis arranca**

```bash
docker-compose up -d redis
docker exec norgtech-redis redis-cli ping
```
Expected: `PONG`

**Step 4: Commit**

```bash
git add docker-compose.yml agents/nora/.env
git commit -m "infra: add Redis and docker-compose for local dev stack"
```

---

### Task 0.2: Crear Dockerfile para API NestJS

**Objective:** La API actual no tiene Dockerfile. Es necesario para desarrollo local con docker-compose y para Dokploy en producción.

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/api/.dockerignore`

**Step 1: Crear `apps/api/Dockerfile`**

```dockerfile
# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/main.js"]
```

**Step 2: Crear `apps/api/.dockerignore`**

```
node_modules
dist
.git
.env
*.log
```

**Step 3: Commit**

```bash
git add apps/api/Dockerfile apps/api/.dockerignore
git commit -m "infra: add Dockerfile for API NestJS"
```

---

### Task 0.3: Migrar Nora de MemorySaver a Redis persistence

**Objective:** Reemplazar `MemorySaver` (volátil, se pierde al reiniciar) por `RedisSaver` para que las sesiones de WhatsApp sobrevivan reinicios.

**Files:**
- Modify: `agents/nora/pyproject.toml` (agregar dependencia)
- Modify: `agents/nora/src/agent.py`
- Modify: `agents/nora/src/config.py`

**Step 1: Agregar dependencia en `pyproject.toml`**

```toml
dependencies = [
    # ... existentes ...
    "redis>=5.0.0",
]
```

**Step 2: Modificar `agents/nora/src/config.py`**

```python
class Settings:
    # ... existentes ...
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
```

**Step 3: Modificar `agents/nora/src/agent.py`**

```python
import redis
from langgraph.checkpoint.redis import RedisSaver

# Reemplazar MemorySaver
redis_client = redis.from_url(settings.redis_url, decode_responses=False)
checkpointer = RedisSaver(redis_client)

# En build_nora_graph():
return workflow.compile(checkpointer=checkpointer)
```

**Step 4: Verificar que Nora arranca con Redis**

```bash
cd agents/nora && pip install -e . && python -c "from src.agent import nora_graph; print('OK')"
```
Expected: `OK`

**Step 5: Commit**

```bash
git add agents/nora/
git commit -m "feat(nora): replace MemorySaver with Redis checkpoint persistence"
```

---

## Fase 1: Scaffolding del WhatsApp Gateway

### Task 1.1: Crear estructura del microservicio

**Objective:** Scaffold de `apps/whatsapp-gateway/` como app independiente del monorepo.

**Files:**
- Create: `apps/whatsapp-gateway/package.json`
- Create: `apps/whatsapp-gateway/tsconfig.json`
- Create: `apps/whatsapp-gateway/Dockerfile`
- Create: `apps/whatsapp-gateway/src/main.ts`
- Create: `apps/whatsapp-gateway/src/app.module.ts`
- Create: `apps/whatsapp-gateway/src/config/kapso.config.ts`

**Step 1: Crear `apps/whatsapp-gateway/package.json`**

```json
{
  "name": "@norgtech/whatsapp-gateway",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.6",
    "@nestjs/config": "^4.0.4",
    "@nestjs/core": "^11.1.6",
    "@nestjs/platform-express": "^11.1.6",
    "@kapso/whatsapp-cloud-api": "^1.0.0",
    "@prisma/client": "^6.7.0",
    "prisma": "^6.7.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.2"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.10",
    "typescript": "^5.8.3"
  }
}
```

**Step 2: Crear `apps/whatsapp-gateway/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "CommonJS",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Crear `apps/whatsapp-gateway/Dockerfile`**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["node", "dist/main.js"]
```

**Step 4: Crear `apps/whatsapp-gateway/src/main.ts`**

```typescript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3002);
  console.log(`WhatsApp Gateway running on port ${process.env.PORT ?? 3002}`);
}
void bootstrap();
```

**Step 5: Crear `apps/whatsapp-gateway/src/app.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { KapsoWebhookModule } from "./webhooks/kapso-webhook.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    KapsoWebhookModule,
  ],
})
export class AppModule {}
```

**Step 6: Crear `apps/whatsapp-gateway/src/config/kapso.config.ts`**

```typescript
export const kapsoConfig = {
  apiKey: process.env.KAPSO_API_KEY || "",
  baseUrl: process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai",
  phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID || "",
  webhookSecret: process.env.KAPSO_WEBHOOK_SECRET || "",
  noraUrl: process.env.NORA_URL || "http://nora:8000",
  apiUrl: process.env.API_URL || "http://api:3001",
  serviceToken: process.env.SERVICE_TOKEN || "",
};
```

**Step 7: Commit**

```bash
git add apps/whatsapp-gateway/
git commit -m "feat(whatsapp-gateway): scaffold microservice with NestJS"
```

---

## Fase 2: Módulo de Identidad (teléfono ↔ usuario)

### Task 2.1: Modelo WhatsAppIdentity en Prisma

**Objective:** Tabla para mapear números de teléfono de WhatsApp a usuarios del CRM. El gateway la lee para identificar quién habla.

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (o donde esté el schema)
- Create: `apps/whatsapp-gateway/prisma/schema.prisma` (si es schema compartido, symlink)

**Step 1: Agregar modelo al schema de Prisma**

```prisma
model WhatsAppIdentity {
  id          String   @id @default(uuid())
  userId      String   @unique
  phoneNumber String   @unique
  waId        String   @unique
  displayName String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])
}
```

> Nota: Asume que existe un modelo `User`. Ajustar el `references` según el schema actual.

**Step 2: Generar migración**

```bash
cd apps/api && npx prisma migrate dev --name add_whatsapp_identity
```

**Step 3: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(db): add WhatsAppIdentity model for phone-to-user mapping"
```

---

### Task 2.2: Servicio de identidad en el Gateway

**Objective:** Servicio que lee de PostgreSQL para resolver `wa_id` o `phoneNumber` → `userId`.

**Files:**
- Create: `apps/whatsapp-gateway/src/identity/identity.module.ts`
- Create: `apps/whatsapp-gateway/src/identity/identity.service.ts`

**Step 1: Crear `identity.service.ts`**

```typescript
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class IdentityService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  async findByPhoneNumber(phoneNumber: string) {
    return this.whatsAppIdentity.findUnique({
      where: { phoneNumber },
      include: { user: true },
    });
  }

  async findByWaId(waId: string) {
    return this.whatsAppIdentity.findUnique({
      where: { waId },
      include: { user: true },
    });
  }
}
```

**Step 2: Crear `identity.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { IdentityService } from "./identity.service";

@Module({
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
```

**Step 3: Commit**

```bash
git add apps/whatsapp-gateway/src/identity/
git commit -m "feat(whatsapp-gateway): add identity service for phone-to-user resolution"
```

---

## Fase 3: Webhooks Kapso (recepción y parseo)

### Task 3.1: Controller y Service de Webhook

**Objective:** Endpoint público `POST /webhooks/kapso` que reciba eventos de Kapso, verifique firma (si aplica), parseé el payload, y lo enrute.

**Files:**
- Create: `apps/whatsapp-gateway/src/webhooks/kapso-webhook.controller.ts`
- Create: `apps/whatsapp-gateway/src/webhooks/kapso-webhook.service.ts`
- Create: `apps/whatsapp-gateway/src/webhooks/kapso-webhook.module.ts`
- Create: `apps/whatsapp-gateway/src/webhooks/dto/kapso-webhook.dto.ts`

**Step 1: Crear DTO `kapso-webhook.dto.ts`**

```typescript
export interface KapsoWebhookPayload {
  event_type: string;
  payload: {
    object: "whatsapp_business_account";
    entry: Array<{
      id: string;
      changes: Array<{
        value: {
          messaging_product: "whatsapp";
          metadata: {
            display_phone_number: string;
            phone_number_id: string;
          };
          contacts?: Array<{
            wa_id: string;
            profile: { name: string };
          }>;
          messages?: Array<{
            id: string;
            from: string;
            timestamp: string;
            type: "text" | "interactive" | "image" | "document";
            text?: { body: string };
            interactive?: {
              type: "button_reply" | "list_reply";
              button_reply?: { id: string; title: string };
              list_reply?: { id: string; title: string };
            };
          }>;
          statuses?: Array<{
            id: string;
            status: "sent" | "delivered" | "read" | "failed";
            timestamp: string;
            recipient_id: string;
          }>;
        };
        field: "messages";
      }>;
    }>;
  };
}
```

**Step 2: Crear `kapso-webhook.service.ts`**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { KapsoWebhookPayload } from "./dto/kapso-webhook.dto";
import { IdentityService } from "../identity/identity.service";
import { kapsoConfig } from "../config/kapso.config";

@Injectable()
export class KapsoWebhookService {
  private readonly logger = new Logger(KapsoWebhookService.name);

  constructor(private readonly identity: IdentityService) {}

  async processWebhook(payload: KapsoWebhookPayload) {
    const entry = payload.payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages || value.messages.length === 0) {
      this.logger.debug("Webhook without messages (status update or other)");
      return { status: "ignored" };
    }

    const message = value.messages[0];
    const from = message.from;
    const contact = value.contacts?.[0];
    const waId = contact?.wa_id || from;

    this.logger.log(`Received message from ${from}: ${message.type}`);

    // 1. Identificar usuario
    const identity = await this.identity.findByWaId(waId);
    if (!identity || !identity.isActive) {
      this.logger.warn(`No identity found for ${waId}`);
      return { status: "no_identity" };
    }

    // 2. Extraer contenido del mensaje
    let content = "";
    if (message.type === "text" && message.text) {
      content = message.text.body;
    } else if (message.type === "interactive" && message.interactive) {
      content = message.interactive.button_reply?.title || message.interactive.list_reply?.title || "";
    } else {
      content = `[Mensaje de tipo: ${message.type}]`;
    }

    // 3. Generar service token
    const serviceToken = this.generateServiceToken(identity.userId);

    // 4. Llamar a Nora
    const noraResponse = await this.callNora({
      content,
      sessionId: `wa-${identity.userId}-${waId}`,
      contextType: null,
      contextEntityId: null,
    }, serviceToken);

    // 5. Adaptar y enviar respuesta
    await this.sendWhatsAppResponse(from, noraResponse);

    return { status: "processed" };
  }

  private generateServiceToken(userId: string): string {
    // JWT simple firmado con SERVICE_TOKEN_SECRET
    // Implementar con jsonwebtoken
    return `Bearer SERVICE_${userId}`; // Placeholder - reemplazar con JWT real
  }

  private async callNora(body: object, token: string): Promise<any> {
    const res = await fetch(`${kapsoConfig.noraUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Nora error: ${res.status}`);
    return res.json();
  }

  private async sendWhatsAppResponse(to: string, noraResponse: any): Promise<void> {
    // Delegado al adapter service (implementado en Fase 4)
    this.logger.log(`Would send response to ${to}: ${JSON.stringify(noraResponse)}`);
  }
}
```

**Step 3: Crear `kapso-webhook.controller.ts`**

```typescript
import { Controller, Post, Body, Headers, Logger } from "@nestjs/common";
import { KapsoWebhookService } from "./kapso-webhook.service";
import { KapsoWebhookPayload } from "./dto/kapso-webhook.dto";

@Controller("webhooks")
export class KapsoWebhookController {
  private readonly logger = new Logger(KapsoWebhookController.name);

  constructor(private readonly service: KapsoWebhookService) {}

  @Post("kapso")
  async handleWebhook(
    @Body() payload: KapsoWebhookPayload,
    @Headers("x-kapso-signature") signature?: string,
  ) {
    // TODO: Verificar firma del webhook si Kapso la envía
    this.logger.log("Received Kapso webhook");
    return this.service.processWebhook(payload);
  }
}
```

**Step 4: Crear `kapso-webhook.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { KapsoWebhookController } from "./kapso-webhook.controller";
import { KapsoWebhookService } from "./kapso-webhook.service";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [IdentityModule],
  controllers: [KapsoWebhookController],
  providers: [KapsoWebhookService],
})
export class KapsoWebhookModule {}
```

**Step 5: Commit**

```bash
git add apps/whatsapp-gateway/src/webhooks/
git commit -m "feat(whatsapp-gateway): add Kapso webhook receiver and processor"
```

---

## Fase 4: Adapter NoraResponse → WhatsApp

### Task 4.1: Servicio adaptador de mensajes

**Objective:** Convertir los tipos de respuesta de Nora (`GreetingResponse`, `ClarificationResponse`, `ProposalResponse`, `AgendaResponse`) a payloads válidos de WhatsApp Cloud API via Kapso.

**Files:**
- Create: `apps/whatsapp-gateway/src/adapter/whatsapp-adapter.module.ts`
- Create: `apps/whatsapp-gateway/src/adapter/whatsapp-adapter.service.ts`

**Step 1: Crear `whatsapp-adapter.service.ts`**

```typescript
import { Injectable } from "@nestjs/common";

export interface WhatsAppPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text" | "interactive" | "template";
  text?: { body: string; preview_url?: boolean };
  interactive?: {
    type: "button" | "list";
    body: { text: string };
    action: any;
    header?: any;
    footer?: any;
  };
}

@Injectable()
export class WhatsAppAdapterService {
  adapt(noraResponse: any, to: string): WhatsAppPayload {
    switch (noraResponse.mode) {
      case "greeting":
        return this.adaptGreeting(noraResponse, to);
      case "clarification":
        return this.adaptClarification(noraResponse, to);
      case "proposal":
        return this.adaptProposal(noraResponse, to);
      case "agenda":
        return this.adaptAgenda(noraResponse, to);
      default:
        return this.adaptFallback(noraResponse, to);
    }
  }

  private adaptGreeting(response: any, to: string): WhatsAppPayload {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: response.message },
    };
  }

  private adaptClarification(response: any, to: string): WhatsAppPayload {
    const options = response.clarification?.options || [];

    if (options.length <= 3) {
      // Usar botones interactivos para pocas opciones
      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: response.message },
          action: {
            buttons: options.map((opt: any) => ({
              type: "reply",
              reply: { id: opt.id, title: this.truncate(opt.label, 20) },
            })),
          },
        },
      };
    }

    // Usar lista interactiva para muchas opciones
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: response.message },
        action: {
          button: "Ver opciones",
          sections: [
            {
              title: "Opciones",
              rows: options.map((opt: any) => ({
                id: opt.id,
                title: this.truncate(opt.label, 24),
                description: opt.label,
              })),
            },
          ],
        },
      },
    };
  }

  private adaptProposal(response: any, to: string): WhatsAppPayload {
    // Propuesta con botones de confirmar/descartar
    const buttons = [];
    if (response.proposal?.blocks?.interaction?.enabled) {
      buttons.push({
        type: "reply",
        reply: { id: "confirm", title: "✅ Confirmar" },
      });
      buttons.push({
        type: "reply",
        reply: { id: "discard", title: "❌ Descartar" },
      });
    }

    if (buttons.length > 0) {
      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: response.message },
          action: { buttons },
        },
      };
    }

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: response.message },
    };
  }

  private adaptAgenda(response: any, to: string): WhatsAppPayload {
    const items = response.agenda?.items || [];
    let text = `${response.message}\n\n`;
    items.forEach((item: any, idx: number) => {
      text += `${idx + 1}. ${item.label}\n`;
      if (item.scheduledAt) {
        text += `   📅 ${item.scheduledAt}\n`;
      }
    });

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text.trim() },
    };
  }

  private adaptFallback(response: any, to: string): WhatsAppPayload {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: response.message || "¿En qué más puedo ayudarte?" },
    };
  }

  private truncate(str: string, maxLength: number): string {
    return str.length > maxLength ? str.slice(0, maxLength - 1) + "…" : str;
  }
}
```

**Step 2: Crear `whatsapp-adapter.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { WhatsAppAdapterService } from "./whatsapp-adapter.service";

@Module({
  providers: [WhatsAppAdapterService],
  exports: [WhatsAppAdapterService],
})
export class WhatsAppAdapterModule {}
```

**Step 3: Commit**

```bash
git add apps/whatsapp-gateway/src/adapter/
git commit -m "feat(whatsapp-gateway): add WhatsApp adapter for NoraResponse types"
```

---

## Fase 5: Integración Kapso SDK (envío de mensajes)

### Task 5.1: Cliente Kapso para envío de mensajes

**Objective:** Integrar `@kapso/whatsapp-cloud-api` para enviar mensajes de vuelta al usuario por WhatsApp.

**Files:**
- Create: `apps/whatsapp-gateway/src/messaging/kapso-client.module.ts`
- Create: `apps/whatsapp-gateway/src/messaging/kapso-client.service.ts`

**Step 1: Instalar dependencia**

```bash
cd apps/whatsapp-gateway && npm install @kapso/whatsapp-cloud-api
```

**Step 2: Crear `kapso-client.service.ts`**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { WhatsAppClient } from "@kapso/whatsapp-cloud-api";
import { kapsoConfig } from "../config/kapso.config";
import { WhatsAppPayload } from "../adapter/whatsapp-adapter.service";

@Injectable()
export class KapsoClientService {
  private readonly logger = new Logger(KapsoClientService.name);
  private client: WhatsAppClient;

  constructor() {
    this.client = new WhatsAppClient({
      baseUrl: kapsoConfig.baseUrl,
      kapsoApiKey: kapsoConfig.apiKey,
    });
  }

  async sendMessage(payload: WhatsAppPayload): Promise<void> {
    try {
      if (payload.type === "text") {
        await this.client.messages.sendText({
          phoneNumberId: kapsoConfig.phoneNumberId,
          to: payload.to,
          body: payload.text!.body,
        });
      } else if (payload.type === "interactive") {
        // Kapso SDK puede requerir formato específico para interactive
        // Fallback a HTTP directo si el SDK no lo soporta
        await this.sendInteractiveHttp(payload);
      }
      this.logger.log(`Message sent to ${payload.to}`);
    } catch (error) {
      this.logger.error(`Failed to send message: ${error}`);
      throw error;
    }
  }

  private async sendInteractiveHttp(payload: WhatsAppPayload): Promise<void> {
    const url = `${kapsoConfig.baseUrl}/meta/whatsapp/${kapsoConfig.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": kapsoConfig.apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Kapso HTTP error: ${res.status}`);
  }
}
```

**Step 3: Crear `kapso-client.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { KapsoClientService } from "./kapso-client.service";

@Module({
  providers: [KapsoClientService],
  exports: [KapsoClientService],
})
export class KapsoClientModule {}
```

**Step 4: Commit**

```bash
git add apps/whatsapp-gateway/src/messaging/ apps/whatsapp-gateway/package*.json
git commit -m "feat(whatsapp-gateway): integrate Kapso SDK for outbound messaging"
```

---

## Fase 6: Auth Service-to-Service

### Task 6.1: JWT de servicio en Gateway

**Objective:** Generar JWTs internos firmados con `SERVICE_TOKEN_SECRET` para que Nora pueda autenticar requests del gateway sin depender de JWTs de usuario web.

**Files:**
- Create: `apps/whatsapp-gateway/src/auth/service-jwt.service.ts`
- Modify: `agents/nora/src/main.py` (aceptar service JWT)

**Step 1: Crear `service-jwt.service.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { kapsoConfig } from "../config/kapso.config";

@Injectable()
export class ServiceJwtService {
  private readonly secret = kapsoConfig.serviceToken;

  generateToken(userId: string): string {
    return jwt.sign(
      { sub: userId, channel: "whatsapp", type: "service" },
      this.secret,
      { expiresIn: "1h" }
    );
  }

  verifyToken(token: string): { sub: string; channel: string } {
    return jwt.verify(token, this.secret) as any;
  }
}
```

**Step 2: Modificar auth de Nora**

En `agents/nora/src/main.py`, modificar `get_auth_header` para aceptar tanto JWTs de usuario (web) como JWTs de servicio (whatsapp):

```python
@app.post("/messages")
async def send_message(
    body: CreateMessageRequest,
    authorization: str = Header(...),
) -> NoraResponse:
    # Validar que sea Bearer
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization.replace("Bearer ", "")
    
    # Si empieza con "SERVICE_", es un token de servicio (placeholder)
    # Si no, es JWT de usuario web
    # En producción: validar firma con SECRET compartido
    
    # Resto del flujo igual...
```

**Step 3: Commit**

```bash
git add apps/whatsapp-gateway/src/auth/ agents/nora/src/main.py
git commit -m "feat(auth): add service-to-service JWT for gateway→Nora communication"
```

---

## Fase 7: Flujo End-to-End

### Task 7.1: Conectar todos los módulos del Gateway

**Objective:** El webhook service debe usar el adapter y el Kapso client para cerrar el loop completo.

**Files:**
- Modify: `apps/whatsapp-gateway/src/webhooks/kapso-webhook.service.ts`

**Step 1: Actualizar imports y constructor**

```typescript
import { WhatsAppAdapterService } from "../adapter/whatsapp-adapter.service";
import { KapsoClientService } from "../messaging/kapso-client.service";
import { ServiceJwtService } from "../auth/service-jwt.service";

constructor(
  private readonly identity: IdentityService,
  private readonly adapter: WhatsAppAdapterService,
  private readonly kapsoClient: KapsoClientService,
  private readonly jwtService: ServiceJwtService,
) {}
```

**Step 2: Actualizar método `processWebhook`**

Reemplazar el placeholder `sendWhatsAppResponse` por:

```typescript
private async sendWhatsAppResponse(to: string, noraResponse: any): Promise<void> {
  const payload = this.adapter.adapt(noraResponse, to);
  await this.kapsoClient.sendMessage(payload);
}
```

Y reemplazar `generateServiceToken` por:

```typescript
private generateServiceToken(userId: string): string {
  return `Bearer ${this.jwtService.generateToken(userId)}`;
}
```

**Step 3: Actualizar `app.module.ts` del Gateway**

```typescript
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { KapsoWebhookModule } from "./webhooks/kapso-webhook.module";
import { IdentityModule } from "./identity/identity.module";
import { WhatsAppAdapterModule } from "./adapter/whatsapp-adapter.module";
import { KapsoClientModule } from "./messaging/kapso-client.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    IdentityModule,
    WhatsAppAdapterModule,
    KapsoClientModule,
    KapsoWebhookModule,
  ],
})
export class AppModule {}
```

**Step 4: Commit**

```bash
git add apps/whatsapp-gateway/src/
git commit -m "feat(whatsapp-gateway): wire up end-to-end flow webhook→identity→Nora→adapter→Kapso"
```

---

## Fase 8: UI Web para vincular número de WhatsApp

### Task 8.1: Página de configuración de WhatsApp

**Objective:** Permitir que los comerciales registren su número de celular y lo vinculen a su cuenta para que el gateway pueda identificarlos.

**Files:**
- Create: `apps/web/src/app/settings/whatsapp/page.tsx`
- Create/modify: endpoint en API NestJS para guardar `WhatsAppIdentity`

**Step 1: Crear página en Next.js**

```tsx
// apps/web/src/app/settings/whatsapp/page.tsx
"use client";
import { useState } from "react";

export default function WhatsAppSettingsPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      if (res.ok) setStatus("success");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Conectar WhatsApp</h1>
      <p className="text-gray-600 mb-6">
        Ingresa tu número de celular para recibir notificaciones y usar Nora por WhatsApp.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+57 300 123 4567"
          className="w-full p-3 border rounded-lg"
          required
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {status === "loading" ? "Conectando..." : "Conectar"}
        </button>
      </form>
      {status === "success" && (
        <p className="mt-4 text-green-600">✅ Número vinculado correctamente</p>
      )}
      {status === "error" && (
        <p className="mt-4 text-red-600">❌ Error al vincular. Intenta de nuevo.</p>
      )}
    </div>
  );
}
```

**Step 2: Crear endpoint en API NestJS**

```typescript
// apps/api/src/modules/whatsapp/whatsapp.controller.ts
@Controller("whatsapp")
export class WhatsAppController {
  @Post("connect")
  @UseGuards(JwtAuthGuard)
  async connect(
    @Body() dto: ConnectWhatsAppDto,
    @CurrentUser() user: User,
  ) {
    // Guardar o actualizar WhatsAppIdentity
    return this.service.connect(user.id, dto.phoneNumber);
  }
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/settings/whatsapp/ apps/api/src/modules/whatsapp/
git commit -m "feat(web+api): add WhatsApp connection page and API endpoint"
```

---

## Fase 9: Testing, Observabilidad y Deploy

### Task 9.1: Health checks y monitoreo

**Objective:** Health checks para Dokploy y logs estructurados.

**Files:**
- Create: `apps/whatsapp-gateway/src/health/health.controller.ts`

**Step 1: Crear health controller**

```typescript
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return { status: "ok", service: "whatsapp-gateway", timestamp: new Date().toISOString() };
  }
}
```

**Step 2: Commit**

```bash
git add apps/whatsapp-gateway/src/health/
git commit -m "feat(whatsapp-gateway): add health check endpoint"
```

---

### Task 9.2: Configuración de Dokploy

**Objective:** Configurar los servicios en Dokploy para el VPS de 2vCPU/8GB.

**Variables de entorno necesarias por servicio:**

| Servicio | Variable | Valor ejemplo |
|---|---|---|
| **Gateway** | `KAPSO_API_KEY` | `kapso_live_xxx` |
| **Gateway** | `KAPSO_PHONE_NUMBER_ID` | `123456789012345` |
| **Gateway** | `KAPSO_API_BASE_URL` | `https://api.kapso.ai` |
| **Gateway** | `KAPSO_WEBHOOK_SECRET` | `whsec_xxx` |
| **Gateway** | `DATABASE_URL` | `postgresql://...` |
| **Gateway** | `NORA_URL` | `http://nora:8000` |
| **Gateway** | `API_URL` | `http://api:3001` |
| **Gateway** | `SERVICE_TOKEN` | `super-secret-jwt-key` |
| **Gateway** | `PORT` | `3002` |
| **Nora** | `REDIS_URL` | `redis://redis:6379/0` |
| **Nora** | `NESTJS_API_URL` | `http://api:3001` |
| **Nora** | `SERVICE_TOKEN_SECRET` | `super-secret-jwt-key` |
| **API** | `DATABASE_URL` | `postgresql://...` |
| **API** | `PORT` | `3001` |
| **Web** | `NEXT_PUBLIC_API_URL` | `https://api.tudominio.com` |

**Webhook URL para Kapso:**
```
https://api.tudominio.com/webhooks/kapso
```

**Step 1: Documentar configuración**

Crear `docs/deploy/whatsapp-gateway-dokploy.md` con las instrucciones detalladas.

**Step 2: Commit**

```bash
git add docs/deploy/
git commit -m "docs: add Dokploy deployment guide for WhatsApp Gateway"
```

---

## Timeline Resumido

| Fase | Tasks | Esfuerzo estimado |
|---|---|---|
| **Fase 0** | Infraestructura base (Redis, Docker, persistencia Nora) | 1-2 días |
| **Fase 1** | Scaffolding del Gateway | 1 día |
| **Fase 2** | Identidad (teléfono ↔ usuario) | 1 día |
| **Fase 3** | Webhooks Kapso | 1 día |
| **Fase 4** | Adapter de respuestas | 1 día |
| **Fase 5** | Kapso SDK (envío) | 1 día |
| **Fase 6** | Auth service-to-service | 0.5 días |
| **Fase 7** | Flujo end-to-end | 1 día |
| **Fase 8** | UI Web (vincular número) | 1 día |
| **Fase 9** | Testing, observabilidad, deploy | 1-2 días |
| **TOTAL** | | **10-12 días** |

---

## Diagrama de arquitectura final

```
Usuario WhatsApp
       │
       ▼
┌──────────────┐
│     Meta     │
│   WhatsApp   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    Kapso     │
│   Webhook    │
└──────┬───────┘
       │ HTTPS POST /webhooks/kapso
       ▼
┌─────────────────────────────┐
│   WhatsApp Gateway :3002    │
│   (NestJS, @kapso/sdk)      │
│                              │
│  ┌──────────────────────┐   │
│  │ IdentityService      │───┼──▶ PostgreSQL (:5432)
│  │ (tel → user)         │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │ KapsoWebhookService  │   │
│  └──────────┬───────────┘   │
│             │ HTTP POST /messages
│             ▼               │
│  ┌──────────────────────┐   │
│  │ Nora :8000           │   │
│  │ (Python + LangGraph) │   │
│  └──────────┬───────────┘   │
│             │ JSON response │
│             ▼               │
│  ┌──────────────────────┐   │
│  │ WhatsAppAdapter      │   │
│  │ (NoraResponse → WA)  │   │
│  └──────────┬───────────┘   │
│             │ Kapso SDK     │
│             ▼               │
│  ┌──────────────────────┐   │
│  │ KapsoClientService   │───┼──▶ Kapso API
│  └──────────────────────┘   │
└─────────────────────────────┘
       │
       ▼
┌──────────────┐
│     Meta     │
│   WhatsApp   │
└──────┬───────┘
       │
       ▼
Usuario WhatsApp
```

---

## Notas importantes

1. **Inbound-only**: Todos los mensajes son iniciados por el usuario. No se requieren templates de Meta.
2. **Redis obligatorio**: Nora usa RedisSaver para persistencia de sesiones. Sin Redis, un reinicio pierde todas las conversaciones.
3. **Schema compartido**: El Gateway lee directamente de PostgreSQL la tabla `WhatsAppIdentity`. No toca otras tablas.
4. **Service Token**: El Gateway genera JWTs internos con `SERVICE_TOKEN_SECRET`. Nora debe validar estos tokens.
5. **Verificación de webhook**: Kapso puede enviar una firma en el header. Implementar validación en producción.
6. **Rate limiting**: Considerar implementar rate limiting por `wa_id` para evitar abuso.
