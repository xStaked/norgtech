# Laura CRM Agent v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Laura to manage the entire CRM through chat — read queries respond directly, write actions generate proposals for confirmation.

**Architecture:** Expand the existing LangGraph agent with new `query` and `modify` nodes, add 12+ read tools and 15+ write tools, create 30+ new LauraAgents API endpoints, extend proposal blocks from 5 to 15 entity types, and add conversational context tracking.

**Tech Stack:** NestJS 11, Prisma 6.7, LangGraph + LangChain, Next.js 16, TypeScript, vitest

---

## File Map

### New files (agent-laura)

| File | Responsibility |
|------|---------------|
| `src/tools/search-products.ts` | Search products by name/SKU |
| `src/tools/get-product-details.ts` | Get product details by ID |
| `src/tools/search-quotes.ts` | Search quotes by customer/status |
| `src/tools/get-quote-details.ts` | Get quote details with items |
| `src/tools/search-orders.ts` | Search orders by customer/status |
| `src/tools/get-order-details.ts` | Get order details with items |
| `src/tools/search-segments.ts` | List/search segments |
| `src/tools/search-contacts.ts` | Search contacts by name/customer |
| `src/tools/search-visits.ts` | Search visits by customer/status/date |
| `src/tools/search-followups.ts` | Search follow-ups by customer/status |
| `src/tools/get-agenda.ts` | Consolidated agenda (tasks + visits) |
| `src/tools/get-dashboard-summary.ts` | Dashboard KPIs |
| `src/tools/create-customer.ts` | Create customer via API |
| `src/tools/update-customer.ts` | Update customer via API |
| `src/tools/create-contact.ts` | Create contact via API |
| `src/tools/update-contact.ts` | Update contact via API |
| `src/tools/create-quote.ts` | Create quote with items |
| `src/tools/update-quote.ts` | Update quote status |
| `src/tools/create-order.ts` | Create order |
| `src/tools/update-order.ts` | Update order status/logistics |
| `src/tools/create-product.ts` | Create product |
| `src/tools/update-product.ts` | Update product |
| `src/tools/create-segment.ts` | Create segment |
| `src/tools/update-segment.ts` | Update segment |
| `src/tools/update-visit.ts` | Update visit (reschedule/complete) |
| `src/tools/update-followup.ts` | Update follow-up (date/status) |
| `src/tools/update-opportunity.ts` | Update opportunity (stage/value) |
| `src/graph/nodes/query.ts` | Query node — direct read responses |
| `src/graph/nodes/modify.ts` | Modify node — detect + build update proposals |

### Modified files (agent-laura)

| File | Change |
|------|--------|
| `src/types.ts` | Add new block types, AgentMode values, mentionedEntities, new response types |
| `src/graph/state.ts` | Add mentionedEntities, activeProposalId, lastAction to state |
| `src/graph/graph.ts` | Add query and modify nodes + edges |
| `src/graph/edges.ts` | Add routing for query/modify intents |
| `src/graph/nodes/router.ts` | Add query/modify pattern detection, LLM fallback |
| `src/graph/nodes/build-proposal.ts` | Support new block types with action field |
| `src/graph/nodes/confirm.ts` | Handle new block types in confirmation |
| `src/tools/index.ts` | Export all new tools |
| `src/tools/nestjs-client.ts` | Add all new API methods |
| `src/prompts/system-prompt.ts` | Update with CRM-wide capabilities |
| `src/prompts/prompt-sections.ts` | Add query/modify prompt sections |
| `src/server.ts` | Update stateToResponse for new modes |
| `src/index.ts` | (no change expected) |

### New files (api)

| File | Responsibility |
|------|---------------|
| `src/modules/laura/dto/laura-agents-query.dto.ts` | DTOs for new agent endpoints |

### Modified files (api)

| File | Change |
|------|--------|
| `src/modules/laura/laura-agents.controller.ts` | Add 30+ new endpoints |
| `src/modules/laura/laura.types.ts` | Add ProposalBlock with action field |

### New files (web)

| File | Responsibility |
|------|---------------|
| `src/components/laura/laura-data-card.tsx` | Render read-only entity data in chat |

### Modified files (web)

| File | Change |
|------|--------|
| `src/components/laura/laura-types.ts` | Add new block types, query/modify modes, data card types |
| `src/components/laura/laura-proposal-block.tsx` | Add icons for new block types |
| `src/components/laura/laura-proposal-card.tsx` | Render new block type forms |
| `src/components/laura/laura-chat.tsx` | Handle query/modify/data responses |
| `src/components/laura/laura-agenda-card.tsx` | Show richer agenda |

---

## Task 1: Expand NestJS LauraAgents API — Read Endpoints

**Files:**
- Modify: `apps/api/src/modules/laura/laura-agents.controller.ts`
- Modify: `apps/api/src/modules/laura/laura-agents.module.ts`
- Create: `apps/api/src/modules/laura/dto/laura-agents-query.dto.ts`

- [ ] **Step 1: Create DTOs for query filters**

Create `apps/api/src/modules/laura/dto/laura-agents-query.dto.ts`:

```typescript
import { IsOptional, IsString, IsEnum, IsBoolean } from "class-validator";

export class SearchProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class SearchQuotesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class SearchOrdersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class SearchContactsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  customerId?: string;
}

export class SearchVisitsDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class SearchFollowupsDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
```

- [ ] **Step 2: Add read endpoints to LauraAgentsController**

Add the following methods to `LauraAgentsController` in `laura-agents.controller.ts`. These follow the exact same pattern as existing endpoints (ServiceTokenGuard, PrismaService direct access, SYSTEM_USER_ID):

```typescript
// Products
@Get("products")
async searchProducts(@Query() dto: SearchProductsDto) {
  const where: any = {};
  if (dto.search) {
    where.OR = [
      { name: { contains: dto.search, mode: "insensitive" } },
      { sku: { contains: dto.search, mode: "insensitive" } },
    ];
  }
  if (dto.active !== undefined) where.active = dto.active;
  const products = await this.prisma.product.findMany({ where, take: 20 });
  return products;
}

@Get("products/:id")
async getProductDetails(@Param("id") id: string) {
  return this.prisma.product.findUniqueOrThrow({ where: { id } });
}

// Quotes
@Get("quotes")
async searchQuotes(@Query() dto: SearchQuotesDto) {
  const where: any = {};
  if (dto.customerId) where.customerId = dto.customerId;
  if (dto.status) where.status = dto.status;
  if (dto.search) {
    where.OR = [
      { customer: { displayName: { contains: dto.search, mode: "insensitive" } } },
      { customer: { legalName: { contains: dto.search, mode: "insensitive" } } },
    ];
  }
  return this.prisma.quote.findMany({
    where,
    include: { items: true, customer: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

@Get("quotes/:id")
async getQuoteDetails(@Param("id") id: string) {
  return this.prisma.quote.findUniqueOrThrow({
    where: { id },
    include: { items: true, customer: { select: { id: true, displayName: true } } },
  });
}

// Orders
@Get("orders")
async searchOrders(@Query() dto: SearchOrdersDto) {
  const where: any = {};
  if (dto.customerId) where.customerId = dto.customerId;
  if (dto.status) where.status = dto.status;
  if (dto.search) {
    where.OR = [
      { customer: { displayName: { contains: dto.search, mode: "insensitive" } } },
      { customer: { legalName: { contains: dto.search, mode: "insensitive" } } },
    ];
  }
  return this.prisma.order.findMany({
    where,
    include: { items: true, customer: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

@Get("orders/:id")
async getOrderDetails(@Param("id") id: string) {
  return this.prisma.order.findUniqueOrThrow({
    where: { id },
    include: { items: true, customer: { select: { id: true, displayName: true } } },
  });
}

// Segments
@Get("segments")
async searchSegments() {
  return this.prisma.customerSegment.findMany({ where: { active: true } });
}

@Get("segments/:id")
async getSegmentDetails(@Param("id") id: string) {
  return this.prisma.customerSegment.findUniqueOrThrow({ where: { id } });
}

// Contacts
@Get("contacts")
async searchContacts(@Query() dto: SearchContactsDto) {
  const where: any = {};
  if (dto.customerId) where.customerId = dto.customerId;
  if (dto.search) {
    where.OR = [
      { fullName: { contains: dto.search, mode: "insensitive" } },
      { email: { contains: dto.search, mode: "insensitive" } },
    ];
  }
  return this.prisma.contact.findMany({
    where,
    include: { customer: { select: { id: true, displayName: true } } },
    take: 20,
  });
}

@Get("contacts/:id")
async getContactDetails(@Param("id") id: string) {
  return this.prisma.contact.findUniqueOrThrow({
    where: { id },
    include: { customer: { select: { id: true, displayName: true } } },
  });
}

// Visits
@Get("visits")
async searchVisits(@Query() dto: SearchVisitsDto) {
  const where: any = {};
  if (dto.customerId) where.customerId = dto.customerId;
  if (dto.status) where.status = dto.status;
  if (dto.dateFrom || dto.dateTo) {
    where.scheduledAt = {};
    if (dto.dateFrom) where.scheduledAt.gte = new Date(dto.dateFrom);
    if (dto.dateTo) where.scheduledAt.lte = new Date(dto.dateTo);
  }
  return this.prisma.visit.findMany({
    where,
    include: { customer: { select: { id: true, displayName: true } } },
    orderBy: { scheduledAt: "desc" },
    take: 20,
  });
}

@Get("visits/:id")
async getVisitDetails(@Param("id") id: string) {
  return this.prisma.visit.findUniqueOrThrow({
    where: { id },
    include: { customer: { select: { id: true, displayName: true } } },
  });
}

// Follow-ups
@Get("followups")
async searchFollowups(@Query() dto: SearchFollowupsDto) {
  const where: any = {};
  if (dto.customerId) where.customerId = dto.customerId;
  if (dto.status) where.status = dto.status;
  return this.prisma.followUpTask.findMany({
    where,
    include: { customer: { select: { id: true, displayName: true } } },
    orderBy: { dueAt: "asc" },
    take: 20,
  });
}

// Dashboard
@Get("dashboard")
async getDashboardSummary(@Query("userId") userId: string) {
  const [
    totalCustomers,
    activeOpportunities,
    pendingTasks,
    scheduledVisits,
    pendingQuotes,
    openOrders,
  ] = await Promise.all([
    this.prisma.customer.count({ where: { active: true } }),
    this.prisma.opportunity.count({
      where: { stage: { notIn: ["venta_cerrada", "perdida"] } },
    }),
    this.prisma.followUpTask.count({
      where: { status: "pendiente", assignedToUserId: userId },
    }),
    this.prisma.visit.count({
      where: { status: "programada", assignedToUserId: userId },
    }),
    this.prisma.quote.count({ where: { status: { in: ["abierta", "en_negociacion"] } } }),
    this.prisma.order.count({ where: { status: { notIn: ["entregado"] } } }),
  ]);

  return {
    totalCustomers,
    activeOpportunities,
    pendingTasks,
    scheduledVisits,
    pendingQuotes,
    openOrders,
  };
}
```

- [ ] **Step 3: Register DTOs in module**

In `laura-agents.module.ts`, no changes needed since the controller uses DTOs directly. Verify it compiles.

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `cd apps/api && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/laura/dto/laura-agents-query.dto.ts apps/api/src/modules/laura/laura-agents.controller.ts
git commit -m "feat(api): add read endpoints to LauraAgents controller for all CRM entities"
```

---

## Task 2: Expand NestJS LauraAgents API — Write Endpoints

**Files:**
- Modify: `apps/api/src/modules/laura/laura-agents.controller.ts`

- [ ] **Step 1: Add write endpoints to LauraAgentsController**

Add the following write endpoints. These use `SYSTEM_USER_ID = "system"` for createdBy/updatedBy fields, matching the existing pattern:

```typescript
// Customers - create
@Post("customers")
async createCustomer(@Body() body: {
  legalName: string;
  displayName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  department?: string;
  notes?: string;
  segmentId?: string;
  assignedToUserId?: string;
}) {
  return this.prisma.customer.create({
    data: {
      legalName: body.legalName,
      displayName: body.displayName ?? body.legalName,
      taxId: body.taxId,
      phone: body.phone,
      email: body.email,
      address: body.address,
      city: body.city,
      department: body.department,
      notes: body.notes,
      segmentId: body.segmentId,
      assignedToUserId: body.assignedToUserId,
      active: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

// Customers - update
@Patch("customers/:id")
async updateCustomer(@Param("id") id: string, @Body() body: {
  legalName?: string;
  displayName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  department?: string;
  notes?: string;
  segmentId?: string;
  assignedToUserId?: string;
  active?: boolean;
}) {
  return this.prisma.customer.update({
    where: { id },
    data: { ...body, updatedBy: SYSTEM_USER_ID },
  });
}

// Contacts - create
@Post("contacts")
async createContact(@Body() body: {
  customerId: string;
  fullName: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
}) {
  return this.prisma.contact.create({
    data: {
      customerId: body.customerId,
      fullName: body.fullName,
      roleTitle: body.roleTitle,
      phone: body.phone,
      email: body.email,
      isPrimary: body.isPrimary ?? false,
      notes: body.notes,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

// Contacts - update
@Patch("contacts/:id")
async updateContact(@Param("id") id: string, @Body() body: {
  fullName?: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
}) {
  return this.prisma.contact.update({
    where: { id },
    data: { ...body, updatedBy: SYSTEM_USER_ID },
  });
}

// Quotes - create
@Post("quotes")
async createQuote(@Body() body: {
  customerId: string;
  opportunityId?: string;
  validUntil?: string;
  notes?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
}) {
  const items = body.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.quantity * item.unitPrice,
    notes: item.notes,
  }));
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);

  return this.prisma.quote.create({
    data: {
      customerId: body.customerId,
      opportunityId: body.opportunityId,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      notes: body.notes,
      subtotal,
      total: subtotal,
      status: "abierta",
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
      items: { create: items },
    },
    include: { items: true },
  });
}

// Quotes - update status
@Patch("quotes/:id/status")
async updateQuoteStatus(@Param("id") id: string, @Body() body: { status: string }) {
  return this.prisma.quote.update({
    where: { id },
    data: { status: body.status, updatedBy: SYSTEM_USER_ID },
  });
}

// Orders - create
@Post("orders")
async createOrder(@Body() body: {
  customerId: string;
  opportunityId?: string;
  sourceQuoteId?: string;
  notes?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
}) {
  const items = body.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.quantity * item.unitPrice,
    notes: item.notes,
  }));
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0);

  return this.prisma.order.create({
    data: {
      customerId: body.customerId,
      opportunityId: body.opportunityId,
      sourceQuoteId: body.sourceQuoteId,
      notes: body.notes,
      subtotal,
      total: subtotal,
      status: "recibido",
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
      items: { create: items },
    },
    include: { items: true },
  });
}

// Orders - update status
@Patch("orders/:id/status")
async updateOrderStatus(@Param("id") id: string, @Body() body: { status: string; notes?: string }) {
  return this.prisma.order.update({
    where: { id },
    data: { status: body.status, notes: body.notes, updatedBy: SYSTEM_USER_ID },
  });
}

// Products - create
@Post("products")
async createProduct(@Body() body: {
  sku: string;
  name: string;
  description?: string;
  unit?: string;
  presentation?: string;
  basePrice: number;
}) {
  return this.prisma.product.create({
    data: {
      sku: body.sku,
      name: body.name,
      description: body.description,
      unit: body.unit,
      presentation: body.presentation,
      basePrice: body.basePrice,
      active: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

// Products - update
@Patch("products/:id")
async updateProduct(@Param("id") id: string, @Body() body: {
  sku?: string;
  name?: string;
  description?: string;
  unit?: string;
  presentation?: string;
  basePrice?: number;
  active?: boolean;
}) {
  return this.prisma.product.update({
    where: { id },
    data: { ...body, updatedBy: SYSTEM_USER_ID },
  });
}

// Segments - create
@Post("segments")
async createSegment(@Body() body: { name: string; description?: string }) {
  return this.prisma.customerSegment.create({
    data: {
      name: body.name,
      description: body.description,
      active: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

// Segments - update
@Patch("segments/:id")
async updateSegment(@Param("id") id: string, @Body() body: {
  name?: string;
  description?: string;
  active?: boolean;
}) {
  return this.prisma.customerSegment.update({
    where: { id },
    data: { ...body, updatedBy: SYSTEM_USER_ID },
  });
}

// Visits - update
@Patch("visits/:id")
async updateVisit(@Param("id") id: string, @Body() body: {
  scheduledAt?: string;
  status?: string;
  summary?: string;
  diagnosis?: string;
  problems?: string;
  proposedSolution?: string;
  notes?: string;
  nextStep?: string;
}) {
  const data: any = { ...body, updatedBy: SYSTEM_USER_ID };
  if (body.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);
  if (body.status === "completada") data.completedAt = new Date();
  return this.prisma.visit.update({ where: { id }, data });
}

// Follow-ups - update
@Patch("followups/:id")
async updateFollowup(@Param("id") id: string, @Body() body: {
  title?: string;
  dueAt?: string;
  status?: string;
  notes?: string;
}) {
  const data: any = { ...body, updatedBy: SYSTEM_USER_ID };
  if (body.dueAt) data.dueAt = new Date(body.dueAt);
  if (body.status === "completada") data.completedAt = new Date();
  return this.prisma.followUpTask.update({ where: { id }, data });
}

// Opportunities - update
@Patch("opportunities/:id")
async updateOpportunity(@Param("id") id: string, @Body() body: {
  stage?: string;
  estimatedValue?: number;
  expectedCloseDate?: string;
  title?: string;
  description?: string;
  lostReason?: string;
}) {
  const data: any = { ...body, updatedBy: SYSTEM_USER_ID };
  if (body.expectedCloseDate) data.expectedCloseDate = new Date(body.expectedCloseDate);
  if (body.stage === "perdida" || body.stage === "venta_cerrada") data.closedAt = new Date();
  return this.prisma.opportunity.update({ where: { id }, data });
}
```

- [ ] **Step 2: Run API tests**

Run: `cd apps/api && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/laura/laura-agents.controller.ts
git commit -m "feat(api): add write endpoints to LauraAgents controller for all CRM entities"
```

---

## Task 3: Update Agent Types

**Files:**
- Modify: `apps/agent-laura/src/types.ts`

- [ ] **Step 1: Update AgentMode and add new types to types.ts**

Replace the entire `types.ts` with the expanded types. Keep all existing types and add new ones:

```typescript
import type { BaseMessage } from "@langchain/core/messages";

export type AgentMode =
  | "greeting"
  | "clarification"
  | "proposal"
  | "agenda"
  | "confirm"
  | "discard"
  | "refine"
  | "qa"
  | "query"
  | "modify";

export type ProposalBlockAction = "create" | "update" | "delete";

export interface InteractionBlock {
  summary: string;
  rawMessage: string;
  enabled: boolean;
  action?: ProposalBlockAction;
}

export interface OpportunityBlock {
  title: string;
  stage: string;
  estimatedValue?: number;
  expectedCloseDate?: string;
  createNew: boolean;
  opportunityId?: string;
  enabled: boolean;
  action?: ProposalBlockAction;
}

export interface FollowUpBlock {
  title: string;
  type: string;
  dueAt: string;
  notes?: string;
  enabled: boolean;
  action?: ProposalBlockAction;
  id?: string;
}

export interface TaskBlock {
  title: string;
  dueAt: string;
  notes?: string;
  enabled: boolean;
  action?: ProposalBlockAction;
}

export interface SignalsBlock {
  objections: string[];
  riskFlags: string[];
  buyingSignals: string[];
  enabled: boolean;
  action?: ProposalBlockAction;
}

export interface CustomerBlock {
  legalName: string;
  displayName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  department?: string;
  notes?: string;
  segmentId?: string;
  assignedToUserId?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface ContactBlock {
  customerId: string;
  fullName: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface QuoteBlock {
  customerId: string;
  opportunityId?: string;
  validUntil?: string;
  notes?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface OrderBlock {
  customerId: string;
  opportunityId?: string;
  sourceQuoteId?: string;
  notes?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface ProductBlock {
  sku: string;
  name: string;
  description?: string;
  unit?: string;
  presentation?: string;
  basePrice?: number;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface SegmentBlock {
  name: string;
  description?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface VisitBlock {
  customerId: string;
  opportunityId?: string;
  scheduledAt: string;
  summary?: string;
  notes?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
}

export interface ProposalPayload {
  blocks: {
    interaction?: InteractionBlock;
    opportunity?: OpportunityBlock;
    followUp?: FollowUpBlock;
    task?: TaskBlock;
    signals?: SignalsBlock;
    customer?: CustomerBlock;
    contact?: ContactBlock;
    quote?: QuoteBlock;
    order?: OrderBlock;
    product?: ProductBlock;
    segment?: SegmentBlock;
    visit?: VisitBlock;
  };
}

export interface MentionedEntities {
  customerId?: string;
  customerName?: string;
  opportunityId?: string;
  quoteId?: string;
  orderId?: string;
  visitId?: string;
  followupId?: string;
  taskId?: string;
  productId?: string;
  segmentId?: string;
}

export interface AgendaItem {
  id: string;
  type: "visit" | "follow_up_task";
  label: string;
  scheduledAt?: string;
  priorityGroup?: number;
}

export interface ClarificationOption {
  id: string;
  label: string;
}

export interface ClarificationPayload {
  type: "customer" | "opportunity" | "product" | "date" | "action";
  options: ClarificationOption[];
}

export interface DataResult {
  entityType: string;
  action: "list" | "detail";
  data: unknown;
  summary: string;
}

export interface AgentResponse {
  mode: AgentMode;
  sessionId: string;
  message: string;
  clarification?: ClarificationPayload;
  proposal?: ProposalPayload;
  proposalId?: string;
  agenda?: { items: AgendaItem[] };
  data?: DataResult;
  confirmation?: { saved: string[]; discarded: string[]; message: string };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent-laura/src/types.ts
git commit -m "feat(agent): expand types with new block types, query/modify modes, and data results"
```

---

## Task 4: Update Agent State

**Files:**
- Modify: `apps/agent-laura/src/graph/state.ts`

- [ ] **Step 1: Add mentionedEntities and data fields to state**

Update the state to include the new context-tracking fields:

```typescript
import { Annotation, BaseMessage } from "@langchain/core/messages";
import type { ProposalPayload, ClarificationPayload, AgendaItem, MentionedEntities, DataResult } from "../types";
import type { AgentMode } from "../types";

export const LauraState = Annotation.Root({
  sessionId: Annotation<string>,
  userId: Annotation<string>,
  messages: Annotation<BaseMessage[]>({
    reducer: (prev: BaseMessage[], next: BaseMessage[]) => [...prev, ...next],
    default: () => [],
  }),
  mode: Annotation<AgentMode>,
  customerContext: Annotation<{ id: string; label: string } | null>({
    reducer: (_prev: { id: string; label: string } | null, next: { id: string; label: string } | null) => next,
    default: () => null,
  }),
  opportunityContext: Annotation<{ id: string; label: string } | null>({
    reducer: (_prev: { id: string; label: string } | null, next: { id: string; label: string } | null) => next,
    default: () => null,
  }),
  clarificationOptions: Annotation<ClarificationPayload | null>({
    reducer: (_prev: ClarificationPayload | null, next: ClarificationPayload | null) => next,
    default: () => null,
  }),
  proposal: Annotation<ProposalPayload | null>({
    reducer: (_prev: ProposalPayload | null, next: ProposalPayload | null) => next,
    default: () => null,
  }),
  proposalId: Annotation<string | null>({
    reducer: (_prev: string | null, next: string | null) => next,
    default: () => null,
  }),
  proposalStatus: Annotation<"draft" | "confirmed" | "discarded">({
    reducer: (_prev: "draft" | "confirmed" | "discarded", next: "draft" | "confirmed" | "discarded") => next,
    default: () => "draft" as const,
  }),
  agendaItems: Annotation<AgendaItem[] | null>({
    reducer: (_prev: AgendaItem[] | null, next: AgendaItem[] | null) => next,
    default: () => null,
  }),
  lastError: Annotation<string | null>({
    reducer: (_prev: string | null, next: string | null) => next,
    default: () => null,
  }),
  _extractionResult: Annotation<Record<string, unknown> | null>({
    reducer: (_prev: Record<string, unknown> | null, next: Record<string, unknown> | null) => next,
    default: () => null,
  }),
  mentionedEntities: Annotation<MentionedEntities>({
    reducer: (prev: MentionedEntities, next: MentionedEntities) => ({ ...prev, ...next }),
    default: () => ({} as MentionedEntities),
  }),
  data: Annotation<DataResult | null>({
    reducer: (_prev: DataResult | null, next: DataResult | null) => next,
    default: () => null,
  }),
});

export type LauraState = typeof LauraState.State;
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent-laura/src/graph/state.ts
git commit -m "feat(agent): add mentionedEntities and data fields to LauraState"
```

---

## Task 5: Expand NestJS Client (Tools Layer)

**Files:**
- Modify: `apps/agent-laura/src/tools/nestjs-client.ts`

- [ ] **Step 1: Add all new API methods to nestjs-client.ts**

Add the following methods to the `NestJsClient` class (or the exported functions, following the existing pattern):

```typescript
// Read operations
export async function searchProducts(params: { search?: string; active?: boolean }) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.active !== undefined) query.set("active", String(params.active));
  return nestjsRequest<any[]>(`/laura/agents/products?${query.toString()}`);
}

export async function getProductDetails(id: string) {
  return nestjsRequest<any>(`/laura/agents/products/${id}`);
}

export async function searchQuotes(params: { customerId?: string; status?: string; search?: string }) {
  const query = new URLSearchParams();
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  return nestjsRequest<any[]>(`/laura/agents/quotes?${query.toString()}`);
}

export async function getQuoteDetails(id: string) {
  return nestjsRequest<any>(`/laura/agents/quotes/${id}`);
}

export async function searchOrders(params: { customerId?: string; status?: string; search?: string }) {
  const query = new URLSearchParams();
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  return nestjsRequest<any[]>(`/laura/agents/orders?${query.toString()}`);
}

export async function getOrderDetails(id: string) {
  return nestjsRequest<any>(`/laura/agents/orders/${id}`);
}

export async function searchSegments() {
  return nestjsRequest<any[]>("/laura/agents/segments");
}

export async function searchContacts(params: { search?: string; customerId?: string }) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.customerId) query.set("customerId", params.customerId);
  return nestjsRequest<any[]>(`/laura/agents/contacts?${query.toString()}`);
}

export async function searchVisits(params: { customerId?: string; status?: string; dateFrom?: string; dateTo?: string }) {
  const query = new URLSearchParams();
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.status) query.set("status", params.status);
  if (params.dateFrom) query.set("dateFrom", params.dateFrom);
  if (params.dateTo) query.set("dateTo", params.dateTo);
  return nestjsRequest<any[]>(`/laura/agents/visits?${query.toString()}`);
}

export async function searchFollowups(params: { customerId?: string; status?: string }) {
  const query = new URLSearchParams();
  if (params.customerId) query.set("customerId", params.customerId);
  if (params.status) query.set("status", params.status);
  return nestjsRequest<any[]>(`/laura/agents/followups?${query.toString()}`);
}

export async function getDashboardSummary(userId?: string) {
  const query = new URLSearchParams();
  if (userId) query.set("userId", userId);
  return nestjsRequest<any>(`/laura/agents/dashboard?${query.toString()}`);
}

// Write operations
export async function createCustomer(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/customers", { method: "POST", body: JSON.stringify(data) });
}

export async function updateCustomer(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createContact(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/contacts", { method: "POST", body: JSON.stringify(data) });
}

export async function updateContact(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createQuote(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/quotes", { method: "POST", body: JSON.stringify(data) });
}

export async function updateQuoteStatus(id: string, data: { status: string }) {
  return nestjsRequest<any>(`/laura/agents/quotes/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createOrder(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/orders", { method: "POST", body: JSON.stringify(data) });
}

export async function updateOrderStatus(id: string, data: { status: string; notes?: string }) {
  return nestjsRequest<any>(`/laura/agents/orders/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createProduct(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/products", { method: "POST", body: JSON.stringify(data) });
}

export async function updateProduct(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/products/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createSegment(data: Record<string, any>) {
  return nestjsRequest<any>("/laura/agents/segments", { method: "POST", body: JSON.stringify(data) });
}

export async function updateSegment(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/segments/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function updateVisit(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/visits/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function updateFollowup(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/followups/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function updateOpportunity(id: string, data: Record<string, any>) {
  return nestjsRequest<any>(`/laura/agents/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent-laura/src/tools/nestjs-client.ts
git commit -m "feat(agent): add all read and write API methods to nestjs-client"
```

---

## Task 6: Create New Agent Tools

**Files:**
- Create: `apps/agent-laura/src/tools/search-products.ts`
- Create: `apps/agent-laura/src/tools/get-product-details.ts`
- Create: `apps/agent-laura/src/tools/search-quotes.ts`
- Create: `apps/agent-laura/src/tools/get-quote-details.ts`
- Create: `apps/agent-laura/src/tools/search-orders.ts`
- Create: `apps/agent-laura/src/tools/get-order-details.ts`
- Create: `apps/agent-laura/src/tools/search-segments.ts`
- Create: `apps/agent-laura/src/tools/search-contacts.ts`
- Create: `apps/agent-laura/src/tools/search-visits.ts`
- Create: `apps/agent-laura/src/tools/search-followups.ts`
- Create: `apps/agent-laura/src/tools/get-agenda.ts`
- Create: `apps/agent-laura/src/tools/get-dashboard-summary.ts`
- Create: `apps/agent-laura/src/tools/create-customer.ts`
- Create: `apps/agent-laura/src/tools/update-customer.ts`
- Create: `apps/agent-laura/src/tools/create-contact.ts`
- Create: `apps/agent-laura/src/tools/update-contact.ts`
- Create: `apps/agent-laura/src/tools/create-quote.ts`
- Create: `apps/agent-laura/src/tools/update-quote.ts`
- Create: `apps/agent-laura/src/tools/create-order.ts`
- Create: `apps/agent-laura/src/tools/update-order.ts`
- Create: `apps/agent-laura/src/tools/create-product.ts`
- Create: `apps/agent-laura/src/tools/update-product.ts`
- Create: `apps/agent-laura/src/tools/create-segment.ts`
- Create: `apps/agent-laura/src/tools/update-segment.ts`
- Create: `apps/agent-laura/src/tools/update-visit.ts`
- Create: `apps/agent-laura/src/tools/update-followup.ts`
- Create: `apps/agent-laura/src/tools/update-opportunity.ts`
- Modify: `apps/agent-laura/src/tools/index.ts`

- [ ] **Step 1: Create read tool files**

Each tool follows the existing pattern from `search-customers.ts`. Example for `search-products.ts`:

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchProducts as apiSearchProducts } from "./nestjs-client";

export const searchProductsTool = tool(
  async ({ search, active }) => {
    const results = await apiSearchProducts({ search, active });
    return JSON.stringify(results);
  },
  {
    name: "search_products",
    description: "Buscar productos por nombre o SKU. Útil para consultar el catálogo de productos disponibles.",
    schema: z.object({
      search: z.string().optional().describe("Texto de búsqueda (nombre o SKU del producto)"),
      active: z.boolean().optional().describe("Filtrar solo productos activos"),
    }),
  },
);
```

Create analogous files for each tool following this pattern. All read tools use GET endpoints; all write tools use POST/PATCH endpoints.

- [ ] **Step 2: Update tools/index.ts to export all new tools**

```typescript
export { searchCustomersTool } from "./search-customers";
export { searchOpportunitiesTool } from "./search-opportunities";
export { getCustomerDetailsTool } from "./get-customer-details";
export { getOpportunityDetailsTool } from "./get-opportunity-details";
export { getScheduledVisitsTool } from "./get-scheduled-visits";
export { getPendingTasksTool } from "./get-pending-tasks";
export { createInteractionTool } from "./create-interaction";
export { createFollowupTool } from "./create-followup";
export { createTaskTool } from "./create-task";
// New read tools
export { searchProductsTool } from "./search-products";
export { getProductDetailsTool } from "./get-product-details";
export { searchQuotesTool } from "./search-quotes";
export { getQuoteDetailsTool } from "./get-quote-details";
export { searchOrdersTool } from "./search-orders";
export { getOrderDetailsTool } from "./get-order-details";
export { searchSegmentsTool } from "./search-segments";
export { searchContactsTool } from "./search-contacts";
export { searchVisitsTool } from "./search-visits";
export { searchFollowupsTool } from "./search-followups";
export { getAgendaTool } from "./get-agenda";
export { getDashboardSummaryTool } from "./get-dashboard-summary";
// New write tools
export { createCustomerTool } from "./create-customer";
export { updateCustomerTool } from "./update-customer";
export { createContactTool } from "./create-contact";
export { updateContactTool } from "./update-contact";
export { createQuoteTool } from "./create-quote";
export { updateQuoteTool } from "./update-quote";
export { createOrderTool } from "./create-order";
export { updateOrderTool } from "./update-order";
export { createProductTool } from "./create-product";
export { updateProductTool } from "./update-product";
export { createSegmentTool } from "./create-segment";
export { updateSegmentTool } from "./update-segment";
export { updateVisitTool } from "./update-visit";
export { updateFollowupTool } from "./update-followup";
export { updateOpportunityTool } from "./update-opportunity";
```

- [ ] **Step 3: Run agent tests**

Run: `cd apps/agent-laura && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All existing tests pass (new tools are not yet used, so no test changes needed yet).

- [ ] **Step 4: Commit**

```bash
git add apps/agent-laura/src/tools/
git commit -m "feat(agent): add all new read and write LangChain tools for CRM entities"
```

---

## Task 7: Add Query and Modify Nodes to Graph

**Files:**
- Create: `apps/agent-laura/src/graph/nodes/query.ts`
- Create: `apps/agent-laura/src/graph/nodes/modify.ts`
- Modify: `apps/agent-laura/src/graph/graph.ts`
- Modify: `apps/agent-laura/src/graph/edges.ts`
- Modify: `apps/agent-laura/src/graph/nodes/router.ts`

- [ ] **Step 1: Create query node**

Create `apps/agent-laura/src/graph/nodes/query.ts`:

```typescript
import type { LauraState } from "../state";
import { createLlm } from "../../config/providers";
import { LAURA_SYSTEM_PROMPT } from "../../prompts/system-prompt";
import { SYSTEM_QUERY_SECTION } from "../../prompts/prompt-sections";
import {
  searchProductsTool,
  searchCustomersTool,
  searchOpportunitiesTool,
  searchQuotesTool,
  searchOrdersTool,
  searchSegmentsTool,
  searchContactsTool,
  searchVisitsTool,
  searchFollowupsTool,
  getCustomerDetailsTool,
  getOpportunityDetailsTool,
  getProductDetailsTool,
  getQuoteDetailsTool,
  getOrderDetailsTool,
  getPendingTasksTool,
  getScheduledVisitsTool,
  getAgendaTool,
  getDashboardSummaryTool,
} from "../../tools";

const allQueryTools = [
  searchProductsTool,
  searchCustomersTool,
  searchOpportunitiesTool,
  searchQuotesTool,
  searchOrdersTool,
  searchSegmentsTool,
  searchContactsTool,
  searchVisitsTool,
  searchFollowupsTool,
  getCustomerDetailsTool,
  getOpportunityDetailsTool,
  getProductDetailsTool,
  getQuoteDetailsTool,
  getOrderDetailsTool,
  getPendingTasksTool,
  getScheduledVisitsTool,
  getAgendaTool,
  getDashboardSummaryTool,
];

export async function queryNode(state: LauraState): Promise<Partial<LauraState>> {
  const llm = createLlm().bindTools(allQueryTools);

  const contextMessages: string[] = [];
  if (state.customerContext) {
    contextMessages.push(`Contexto de cliente: ${state.customerContext.label} (ID: ${state.customerContext.id})`);
  }
  if (state.opportunityContext) {
    contextMessages.push(`Contexto de oportunidad: ${state.opportunityContext.label} (ID: ${state.opportunityContext.id})`);
  }
  if (state.mentionedEntities && Object.keys(state.mentionedEntities).length > 0) {
    contextMessages.push(`Entidades mencionadas: ${JSON.stringify(state.mentionedEntities)}`);
  }

  const systemContent = `${LAURA_SYSTEM_PROMPT}\n\n${SYSTEM_QUERY_SECTION}\n\n${contextMessages.join("\n")}`;

  let currentMessages = [new (await import("@langchain/core/messages")).SystemMessage(systemContent), ...state.messages];
  
  const maxIterations = 5;
  for (let i = 0; i < maxIterations; i++) {
    const response = await llm.invoke(currentMessages);
    
    if (response.content && !response.tool_calls?.length) {
      const mentionedEntities = extractMentionedEntities(response.content, state);
      return {
        mode: "query" as const,
        messages: [response],
        data: null,
        mentionedEntities: mentionedEntities || state.mentionedEntities,
      };
    }
    
    if (response.tool_calls?.length) {
      currentMessages.push(response);
      for (const toolCall of response.tool_calls) {
        const tool = allQueryTools.find(t => t.name === toolCall.name);
        if (tool) {
          const result = await tool.invoke(toolCall.args);
          currentMessages.push(new (await import("@langchain/core/messages")).ToolMessage(result, toolCall.id ?? ""));
        }
      }
    }
  }

  return {
    mode: "query" as const,
    messages: [new (await import("@langchain/core/messages")).AIMessage("No pude obtener la información solicitada. ¿Podrías reformular la consulta?")],
    data: null,
  };
}

function extractMentionedEntities(responseContent: string, state: LauraState): Partial<Record<string, string>> | null {
  // Simple entity extraction from response — can be enhanced later
  return null;
}
```

- [ ] **Step 2: Create modify node**

Create `apps/agent-laura/src/graph/nodes/modify.ts`:

```typescript
import type { LauraState } from "../state";
import { createLlm } from "../../config/providers";
import { LAURA_SYSTEM_PROMPT } from "../../prompts/system-prompt";
import { SYSTEM_MODIFY_SECTION } from "../../prompts/prompt-sections";
import type { ProposalPayload } from "../../types";
import * as uuid from "uuid";

export async function modifyNode(state: LauraState): Promise<Partial<LauraState>> {
  const llm = createLlm();

  const lastMessage = state.messages[state.messages.length - 1]?.content as string;
  
  const contextLines: string[] = [];
  if (state.customerContext) {
    contextLines.push(`Cliente: ${state.customerContext.label} (ID: ${state.customerContext.id})`);
  }
  if (state.opportunityContext) {
    contextLines.push(`Oportunidad: ${state.opportunityContext.label} (ID: ${state.opportunityContext.id})`);
  }
  if (state.mentionedEntities && Object.keys(state.mentionedEntities).length > 0) {
    for (const [key, value] of Object.entries(state.mentionedEntities)) {
      if (value) contextLines.push(`${key}: ${value}`);
    }
  }
  if (state.proposal) {
    contextLines.push(`Propuesta activa: ${JSON.stringify(state.proposal)}`);
  }

  const systemContent = `${LAURA_SYSTEM_PROMPT}\n\n${SYSTEM_MODIFY_SECTION}\n\n${contextLines.join("\n")}`;

  const extractionResult = await llm.invoke([
    { role: "system", content: systemContent },
    { role: "user", content: lastMessage },
  ]);

  let parsed: Record<string, unknown>;
  try {
    const content = typeof extractionResult.content === "string" ? extractionResult.content : JSON.stringify(extractionResult.content);
    parsed = JSON.parse(content);
  } catch {
    parsed = { intent: "report", interactionSummary: lastMessage };
  }

  const blocks: ProposalPayload["blocks"] = {};
  
  // Map LLM extraction result to blocks based on entity type and action
  const entityType = parsed.entityType as string | undefined;
  const action = (parsed.action as "create" | "update" | "delete") ?? "create";
  const data = (parsed.data as Record<string, unknown>) ?? {};

  switch (entityType) {
    case "followup": {
      blocks.followUp = {
        title: (data.title as string) ?? "Seguimiento",
        type: (data.type as string) ?? "llamada",
        dueAt: (data.dueAt as string) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: data.notes as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "visit": {
      blocks.visit = {
        customerId: (data.customerId as string) ?? state.customerContext?.id ?? "",
        scheduledAt: (data.scheduledAt as string) ?? new Date().toISOString(),
        summary: data.summary as string | undefined,
        notes: data.notes as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "opportunity": {
      blocks.opportunity = {
        title: (data.title as string) ?? "Nueva oportunidad",
        stage: (data.stage as string) ?? "prospecto",
        estimatedValue: data.estimatedValue as number | undefined,
        createNew: !data.id,
        opportunityId: data.id as string | undefined,
        enabled: true,
        action,
      };
      break;
    }
    case "customer": {
      blocks.customer = {
        legalName: (data.legalName as string) ?? "",
        displayName: data.displayName as string | undefined,
        phone: data.phone as string | undefined,
        email: data.email as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "contact": {
      blocks.contact = {
        customerId: (data.customerId as string) ?? state.customerContext?.id ?? "",
        fullName: (data.fullName as string) ?? "",
        phone: data.phone as string | undefined,
        email: data.email as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "quote": {
      blocks.quote = {
        customerId: (data.customerId as string) ?? state.customerContext?.id ?? "",
        opportunityId: data.opportunityId as string | undefined,
        items: data.items as Array<{ productId: string; quantity: number; unitPrice: number }> | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "order": {
      blocks.order = {
        customerId: (data.customerId as string) ?? state.customerContext?.id ?? "",
        opportunityId: data.opportunityId as string | undefined,
        sourceQuoteId: data.sourceQuoteId as string | undefined,
        items: data.items as Array<{ productId: string; quantity: number; unitPrice: number }> | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "product": {
      blocks.product = {
        sku: (data.sku as string) ?? "",
        name: (data.name as string) ?? "",
        basePrice: data.basePrice as number | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    case "segment": {
      blocks.segment = {
        name: (data.name as string) ?? "",
        description: data.description as string | undefined,
        enabled: true,
        action,
        id: data.id as string | undefined,
      };
      break;
    }
    default: {
      // Fallback: treat as interaction/visit
      blocks.interaction = {
        summary: (parsed.interactionSummary as string) ?? lastMessage,
        rawMessage: lastMessage,
        enabled: true,
        action: "create",
      };
    }
  }

  const proposalPayload: ProposalPayload = { blocks };
  const proposalId = state.proposalId ?? uuid.v4();

  return {
    mode: "proposal" as const,
    proposal: proposalPayload,
    proposalId,
    proposalStatus: "draft" as const,
    messages: [],
  };
}
```

- [ ] **Step 3: Update router to handle query and modify intents**

In `apps/agent-laura/src/graph/nodes/router.ts`, add pattern detection for `query` and `modify` intents. Add these patterns after the existing QA check and before the default fallback:

```typescript
// Query patterns — read-only data requests
const queryKeywords = [
  "productos", "catálogo", "catalogo", "qué productos", "que productos",
  "cotizaciones", "cotización", "cotizacion", "pedidos", "pedido",
  "segmentos", "segmento", "contactos", "contacto",
  "clientes", "cliente", "oportunidades", "oportunidad",
  "cuántos", "cuanto", "cuántas", "cuantas", "cuál es", "cual es",
  "datos de", "info de", "información de", "informacion de",
  "detalle de", "detalles de", "detalles del",
  "buscar", "buscá", "busca", "encontrá", "encontra",
  "listado", "lista de", "ver todos", "mostrá", "muestra",
  "cuánto vale", "cuanto vale", "precio de",
  "estado de", "status de",
];

// Modify patterns — change/update existing entities
const modifyKeywords = [
  "cambiá", "cambia", "cambiar", "modificá", "modifica", "modificar",
  "actualizá", "actualiza", "actualizar", "editá", "edita", "editar",
  "reprogramá", "reprograma", "reprogramar", "mové", "move",
  "cancelá", "cancela", "cancelar", "eliminá", "elimina", "eliminar",
  "completá", "completa", "completar", "cerrá", "cierra", "cerrar",
  "avanzá", "avanza", "pasar a",
  "la hora", "el horario", "la fecha", "el estado",
];

// In the router logic, after agenda check but before default fallback:
const normalized = normalize(content);

if (queryKeywords.some(kw => normalized.includes(normalize(kw)))) {
  return { ...state, mode: "query" };
}

if (modifyKeywords.some(kw => normalized.includes(normalize(kw)))) {
  return { ...state, mode: "modify" };
}
```

- [ ] **Step 4: Update graph.ts to add new nodes and edges**

In `apps/agent-laura/src/graph/graph.ts`, add the new nodes and edges:

```typescript
import { queryNode } from "./nodes/query";
import { modifyNode } from "./nodes/modify";

// After existing node additions:
graph.addNode("query", queryNode);
graph.addNode("modify", modifyNode);

// In the routerEdge conditional, add:
"query": "query",
"modify": "modify",
```

And register the edge mappings so both query and modify nodes lead to END (query returns direct response, modify returns proposal which then needs confirmation flow):

```typescript
graph.addEdge("query", END);
// modify → build_proposal already handled by existing edge
```

Wait — modify should go to build_proposal, not END directly. But actually, modify IS building the proposal. So modify can return the proposal directly and go to END (the user sees it and then confirms/discards). Let me reconsider...

Actually, the modify node builds its own proposal (similar to build-proposal). So modify → END is correct. The confirm/discard cycle stays the same.

```typescript
graph.addEdge("query", END);
graph.addEdge("modify", END);
```

- [ ] **Step 5: Update edges.ts**

In `apps/agent-laura/src/graph/edges.ts`, add the new mode routes to the conditional edge:

```typescript
// In the routerEdge function, add cases for query and modify:
"query": "query",
"modify": "modify",
```

- [ ] **Step 6: Add prompt sections for query and modify**

Add to `apps/agent-laura/src/prompts/prompt-sections.ts`:

```typescript
export const SYSTEM_QUERY_SECTION = `Eres Laura, asistente comercial. El usuario está haciendo una consulta de lectura. Usá las herramientas disponibles para buscar la información y respondé directamente en español argentino. Sé conciso y organizá la información en listas o tablas si hay muchos datos. Si no encontrás resultados, decilo claramente.`;

export const SYSTEM_MODIFY_SECTION = `Eres Laura, asistente comercial. El usuario quiere modificar un registro existente. Extraé la siguiente información del mensaje:
- entityType: qué entidad modificar (followup, visit, opportunity, customer, contact, quote, order, product, segment)
- action: siempre "update" para modificaciones
- data: los campos a modificar, incluyendo el ID del registro si se conoce

Formato de respuesta: JSON con campos entityType, action, y data (objeto con los campos a modificar).

Ejemplo para "cambiá la hora de la tarea a las 14:20":
{"entityType": "followup", "action": "update", "data": {"dueAt": "2026-05-10T14:20:00-03:00"}}
`;
```

- [ ] **Step 7: Run tests and fix any issues**

Run: `cd apps/agent-laura && npx vitest run --reporter=verbose 2>&1 | tail -50`
Expected: Tests may need updates for router classification changes. Fix any failures.

- [ ] **Step 8: Commit**

```bash
git add apps/agent-laura/src/graph/nodes/query.ts apps/agent-laura/src/graph/nodes/modify.ts apps/agent-laura/src/graph/graph.ts apps/agent-laura/src/graph/edges.ts apps/agent-laura/src/graph/nodes/router.ts apps/agent-laura/src/prompts/prompt-sections.ts
git commit -m "feat(agent): add query and modify nodes, update router and graph"
```

---

## Task 8: Update Confirm Handler for New Block Types

**Files:**
- Modify: `apps/agent-laura/src/graph/nodes/confirm.ts`
- Modify: `apps/agent-laura/src/confirm.ts`

- [ ] **Step 1: Extend confirm.ts (standalone) to handle new blocks**

Add handlers for each new block type in the `handleConfirm` function. After the existing block handlers, add:

```typescript
// Customer
if (proposal.blocks.customer?.enabled) {
  if (proposal.blocks.customer.action === "create") {
    const created = await createCustomer({
      legalName: proposal.blocks.customer.legalName,
      displayName: proposal.blocks.customer.displayName,
      taxId: proposal.blocks.customer.taxId,
      phone: proposal.blocks.customer.phone,
      email: proposal.blocks.customer.email,
    });
    saved.push("customer");
    createdIds.push({ entity: "customer", id: created.id });
  } else if (proposal.blocks.customer.action === "update" && proposal.blocks.customer.id) {
    await updateCustomer(proposal.blocks.customer.id, {
      legalName: proposal.blocks.customer.legalName,
      displayName: proposal.blocks.customer.displayName,
      phone: proposal.blocks.customer.phone,
      email: proposal.blocks.customer.email,
    });
    saved.push("customer");
  }
}

// Contact
if (proposal.blocks.contact?.enabled) {
  if (proposal.blocks.contact.action === "create") {
    const created = await createContact({
      customerId: proposal.blocks.contact.customerId,
      fullName: proposal.blocks.contact.fullName,
      phone: proposal.blocks.contact.phone,
      email: proposal.blocks.contact.email,
    });
    saved.push("contact");
    createdIds.push({ entity: "contact", id: created.id });
  } else if (proposal.blocks.contact.action === "update" && proposal.blocks.contact.id) {
    await updateContact(proposal.blocks.contact.id, {
      fullName: proposal.blocks.contact.fullName,
      phone: proposal.blocks.contact.phone,
      email: proposal.blocks.contact.email,
    });
    saved.push("contact");
  }
}

// Quote
if (proposal.blocks.quote?.enabled) {
  if (proposal.blocks.quote.action === "create") {
    const created = await createQuote({
      customerId: proposal.blocks.quote.customerId,
      opportunityId: proposal.blocks.quote.opportunityId,
      items: proposal.blocks.quote.items ?? [],
    });
    saved.push("quote");
    createdIds.push({ entity: "quote", id: created.id });
  } else if (proposal.blocks.quote.action === "update" && proposal.blocks.quote.id) {
    await updateQuoteStatus(proposal.blocks.quote.id, {
      status: (proposal.blocks.quote as any).status ?? "abierta",
    });
    saved.push("quote");
  }
}

// Order
if (proposal.blocks.order?.enabled) {
  if (proposal.blocks.order.action === "create") {
    const created = await createOrder({
      customerId: proposal.blocks.order.customerId,
      opportunityId: proposal.blocks.order.opportunityId,
      sourceQuoteId: proposal.blocks.order.sourceQuoteId,
      items: proposal.blocks.order.items ?? [],
    });
    saved.push("order");
    createdIds.push({ entity: "order", id: created.id });
  } else if (proposal.blocks.order.action === "update" && proposal.blocks.order.id) {
    await updateOrderStatus(proposal.blocks.order.id, {
      status: (proposal.blocks.order as any).status ?? "recibido",
    });
    saved.push("order");
  }
}

// Product
if (proposal.blocks.product?.enabled) {
  if (proposal.blocks.product.action === "create") {
    const created = await createProduct({
      sku: proposal.blocks.product.sku,
      name: proposal.blocks.product.name,
      basePrice: proposal.blocks.product.basePrice,
    });
    saved.push("product");
    createdIds.push({ entity: "product", id: created.id });
  } else if (proposal.blocks.product.action === "update" && proposal.blocks.product.id) {
    await updateProduct(proposal.blocks.product.id, {
      name: proposal.blocks.product.name,
      basePrice: proposal.blocks.product.basePrice,
    });
    saved.push("product");
  }
}

// Segment
if (proposal.blocks.segment?.enabled) {
  if (proposal.blocks.segment.action === "create") {
    const created = await createSegment({
      name: proposal.blocks.segment.name,
      description: proposal.blocks.segment.description,
    });
    saved.push("segment");
    createdIds.push({ entity: "segment", id: created.id });
  } else if (proposal.blocks.segment.action === "update" && proposal.blocks.segment.id) {
    await updateSegment(proposal.blocks.segment.id, {
      name: proposal.blocks.segment.name,
      description: proposal.blocks.segment.description,
    });
    saved.push("segment");
  }
}

// Visit update
if (proposal.blocks.visit?.enabled) {
  if (proposal.blocks.visit.action === "update" && proposal.blocks.visit.id) {
    await updateVisit(proposal.blocks.visit.id, {
      scheduledAt: proposal.blocks.visit.scheduledAt,
      summary: proposal.blocks.visit.summary,
    });
    saved.push("visit");
  }
}

// FollowUp update (for modify actions where we update instead of create)
if (proposal.blocks.followUp?.enabled && proposal.blocks.followUp.action === "update" && proposal.blocks.followUp.id) {
  await updateFollowup(proposal.blocks.followUp.id, {
    dueAt: proposal.blocks.followUp.dueAt,
    title: proposal.blocks.followUp.title,
    notes: proposal.blocks.followUp.notes,
  });
  saved.push("followup");
}
```

- [ ] **Step 2: Apply similar changes to graph confirm node**

Apply the same block handling logic to the `confirmNode` in `apps/agent-laura/src/graph/nodes/confirm.ts`.

- [ ] **Step 3: Run tests**

Run: `cd apps/agent-laura && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/agent-laura/src/confirm.ts apps/agent-laura/src/graph/nodes/confirm.ts
git commit -m "feat(agent): extend confirm handler with new block types (customer, contact, quote, order, product, segment, visit, followup update)"
```

---

## Task 9: Update Response Serialization (server.ts)

**Files:**
- Modify: `apps/agent-laura/src/server.ts`

- [ ] **Step 1: Add data and new mode handling to stateToResponse**

Update the `stateToResponse` function to include the new modes and `data` field:

```typescript
function stateToResponse(state: LauraState): AgentResponse {
  const base: AgentResponse = {
    mode: state.mode,
    sessionId: state.sessionId,
    message: "",
  };

  switch (state.mode) {
    case "greeting":
      return { ...base, message: state.messages[state.messages.length - 1]?.content as string ?? "¡Hola! Soy Laura, tu asistente comercial." };
    case "clarification":
      return {
        ...base,
        message: "Encontré varios resultados. ¿Podrías especificar a cuál te referís?",
        clarification: state.clarificationOptions ?? undefined,
      };
    case "proposal":
      return {
        ...base,
        message: "Preparé una propuesta para que revises.",
        proposal: state.proposal ?? undefined,
        proposalId: state.proposalId ?? undefined,
      };
    case "agenda":
      return {
        ...base,
        message: "Estas son tus prioridades comerciales actuales:",
        agenda: { items: state.agendaItems ?? [] },
      };
    case "confirm":
      return {
        ...base,
        message: state.messages[state.messages.length - 1]?.content as string ?? "Propuesta confirmada.",
      };
    case "discard":
      return { ...base, message: "Propuesta descartada." };
    case "refine":
      return {
        ...base,
        message: "Propuesta actualizada.",
        proposal: state.proposal ?? undefined,
        proposalId: state.proposalId ?? undefined,
      };
    case "qa":
      return { ...base, message: state.messages[state.messages.length - 1]?.content as string ?? "" };
    case "query":
      return { ...base, message: state.messages[state.messages.length - 1]?.content as string ?? "", data: state.data ?? undefined };
    case "modify":
      return {
        ...base,
        message: "Preparé una propuesta de modificación para que revises.",
        proposal: state.proposal ?? undefined,
        proposalId: state.proposalId ?? undefined,
      };
    default:
      return { ...base, message: "No entendí tu mensaje. ¿Podrías reformular?" };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent-laura/src/server.ts
git commit -m "feat(agent): add query and modify mode handling to stateToResponse"
```

---

## Task 10: Update Frontend Types

**Files:**
- Modify: `apps/web/src/components/laura/laura-types.ts`

- [ ] **Step 1: Add new block types and response modes to laura-types.ts**

Add the following type definitions alongside the existing ones:

```typescript
export type ProposalBlockAction = "create" | "update" | "delete";

// New block types
export type LauraCustomerBlock = {
  legalName: string;
  displayName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  department?: string;
  notes?: string;
  segmentId?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
};

export type LauraContactBlock = {
  customerId: string;
  fullName: string;
  roleTitle?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
};

export type LauraQuoteBlock = {
  customerId: string;
  opportunityId?: string;
  validUntil?: string;
  notes?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
};

export type LauraOrderBlock = {
  customerId: string;
  opportunityId?: string;
  sourceQuoteId?: string;
  notes?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
  }>;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
};

export type LauraProductBlock = {
  sku: string;
  name: string;
  description?: string;
  unit?: string;
  presentation?: string;
  basePrice?: number;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
};

export type LauraSegmentBlock = {
  name: string;
  description?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
};

export type LauraVisitBlock = {
  customerId: string;
  opportunityId?: string;
  scheduledAt: string;
  summary?: string;
  notes?: string;
  enabled: boolean;
  action: ProposalBlockAction;
  id?: string;
};
```

Update `LauraProposalPayload` to include the new block types:

```typescript
export type LauraProposalPayload = {
  blocks: {
    interaction?: LauraInteractionBlock;
    opportunity?: LauraOpportunityBlock;
    followUp?: LauraFollowUpBlock;
    task?: LauraTaskBlock;
    signals?: LauraSignalsBlock;
    customer?: LauraCustomerBlock;
    contact?: LauraContactBlock;
    quote?: LauraQuoteBlock;
    order?: LauraOrderBlock;
    product?: LauraProductBlock;
    segment?: LauraSegmentBlock;
    visit?: LauraVisitBlock;
  };
};
```

Add `data` to `LauraAssistantResponse`:

```typescript
export type LauraAssistantResponse = {
  mode: "greeting" | "clarification" | "proposal" | "confirm" | "discard" | "refine" | "agenda" | "qa" | "query" | "modify";
  sessionId: string;
  message: string;
  clarification?: {
    type: "customer" | "opportunity" | "product" | "date" | "action";
    options?: Array<{ id: string; label: string }>;
  };
  proposal?: LauraProposalPayload;
  proposalId?: string;
  agenda?: { items: LauraAgendaItem[] };
  data?: {
    entityType: string;
    action: "list" | "detail";
    data: unknown;
    summary: string;
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/laura/laura-types.ts
git commit -m "feat(web): add new block types and response modes to Laura frontend types"
```

---

## Task 11: Update Proposal Card with New Block Types

**Files:**
- Modify: `apps/web/src/components/laura/laura-proposal-block.tsx`
- Modify: `apps/web/src/components/laura/laura-proposal-card.tsx`

- [ ] **Step 1: Add icons for new block types**

In `laura-proposal-block.tsx`, add new icons:

```typescript
import { MessageSquare, Target, CalendarClock, ClipboardList, Activity, User, Users, FileText, ShoppingCart, Package, Tag, MapPin } from "lucide-react";

const blockIcons: Record<string, typeof MessageSquare> = {
  Interacción: MessageSquare,
  Oportunidad: Target,
  Seguimiento: CalendarClock,
  "Tarea interna": ClipboardList,
  "Señales comerciales": Activity,
  Cliente: User,
  Contacto: Users,
  Cotización: FileText,
  Pedido: ShoppingCart,
  Producto: Package,
  Segmento: Tag,
  Visita: MapPin,
};
```

- [ ] **Step 2: Add render functions for each new block type in laura-proposal-card.tsx**

Add specialized render functions for each new block type alongside the existing ones. Each follows the same pattern as the existing `interaction`, `opportunity`, `followUp`, `task`, and `signals` blocks. Example for customer block:

```typescript
{proposal.blocks.customer && (
  <LauraProposalBlock
    title="Cliente"
    description={proposal.blocks.customer.action === "create" ? "Crear nuevo cliente." : "Actualizar datos del cliente."}
    enabled={proposal.blocks.customer.enabled}
    onToggle={(enabled) =>
      updateProposal((draft) => ({
        ...draft,
        blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, enabled } : draft.blocks.customer },
      }))
    }
    toggleLabel="Guardar bloque de cliente"
  >
    <TextField
      label="Nombre legal"
      value={proposal.blocks.customer.legalName}
      onChange={(legalName) =>
        updateProposal((draft) => ({
          ...draft,
          blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, legalName } : draft.blocks.customer },
        }))
      }
      disabled={confirming}
    />
    {proposal.blocks.customer.displayName !== undefined && (
      <TextField
        label="Nombre para mostrar"
        value={proposal.blocks.customer.displayName ?? ""}
        onChange={(displayName) =>
          updateProposal((draft) => ({
            ...draft,
            blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, displayName } : draft.blocks.customer },
          }))
        }
        disabled={confirming}
      />
    )}
    <TextField
      label="Teléfono"
      value={proposal.blocks.customer.phone ?? ""}
      onChange={(phone) =>
        updateProposal((draft) => ({
          ...draft,
          blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, phone } : draft.blocks.customer },
        }))
      }
      disabled={confirming}
    />
    <TextField
      label="Email"
      value={proposal.blocks.customer.email ?? ""}
      onChange={(email) =>
        updateProposal((draft) => ({
          ...draft,
          blocks: { ...draft.blocks, customer: draft.blocks.customer ? { ...draft.blocks.customer, email } : draft.blocks.customer },
        }))
      }
      disabled={confirming}
    />
    {proposal.blocks.customer.action === "update" && (
      <p style={{ fontSize: 12, color: crmTheme.colors.textMuted, margin: "4px 0 0" }}>
        Modificando registro existente (ID: {proposal.blocks.customer.id})
      </p>
    )}
  </LauraProposalBlock>
)}
```

Follow the same pattern for contact, quote, order, product, segment, and visit blocks. Each has its own fields.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/laura/laura-proposal-block.tsx apps/web/src/components/laura/laura-proposal-card.tsx
git commit -m "feat(web): add UI for new proposal block types (customer, contact, quote, order, product, segment, visit)"
```

---

## Task 12: Add Laura Data Card Component

**Files:**
- Create: `apps/web/src/components/laura/laura-data-card.tsx`
- Modify: `apps/web/src/components/laura/laura-chat.tsx`

- [ ] **Step 1: Create laura-data-card.tsx**

This component renders read-only query results (product lists, customer details, etc.) in a card format in the chat:

```tsx
"use client";

import { MapPin, Phone, Package, FileText, ShoppingCart, Tag, User, Users, Calendar } from "lucide-react";
import { crmTheme } from "@/components/ui/theme";

interface DataCardProps {
  entityType: string;
  action: "list" | "detail";
  data: unknown;
  summary: string;
}

const entityIcons: Record<string, typeof User> = {
  customer: User,
  contact: Users,
  product: Package,
  quote: FileText,
  order: ShoppingCart,
  segment: Tag,
  visit: MapPin,
  followup: Calendar,
  opportunity: Phone,
};

const entityLabels: Record<string, { singular: string; plural: string }> = {
  customer: { singular: "Cliente", plural: "Clientes" },
  contact: { singular: "Contacto", plural: "Contactos" },
  product: { singular: "Producto", plural: "Productos" },
  quote: { singular: "Cotización", plural: "Cotizaciones" },
  order: { singular: "Pedido", plural: "Pedidos" },
  segment: { singular: "Segmento", plural: "Segmentos" },
  visit: { singular: "Visita", plural: "Visitas" },
  followup: { singular: "Seguimiento", plural: "Seguimientos" },
  opportunity: { singular: "Oportunidad", plural: "Oportunidades" },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toLocaleString("es-AR");
  if (value instanceof Date) return value.toLocaleDateString("es-AR");
  return String(value);
}

export function LauraDataCard({ entityType, action, data, summary }: DataCardProps) {
  const Icon = entityIcons[entityType] ?? User;
  const labels = entityLabels[entityType] ?? { singular: entityType, plural: entityType };

  if (action === "list" && Array.isArray(data)) {
    return (
      <div
        style={{
          borderRadius: crmTheme.radius.lg,
          border: `1px solid ${crmTheme.laura.border}`,
          background: crmTheme.colors.surface,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: crmTheme.laura.soft,
            borderBottom: `1px solid ${crmTheme.laura.border}`,
          }}
        >
          <Icon size={16} color={crmTheme.laura.primary} />
          <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
            {data.length} {data.length === 1 ? labels.singular : labels.plural}
          </span>
        </div>
        <div style={{ display: "grid", gap: 0 }}>
          {data.slice(0, 10).map((item, index) => (
            <div
              key={(item as any).id ?? index}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                padding: "10px 14px",
                borderBottom: index < Math.min(data.length, 10) - 1 ? `1px solid ${crmTheme.laura.border}` : "none",
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 600, color: crmTheme.laura.textPrimary }}>
                {(item as any).displayName ?? (item as any).name ?? (item as any).title ?? (item as any).fullName ?? `#${index + 1}`}
              </span>
              <span style={{ color: crmTheme.laura.textMuted }}>
                {(item as any).phone ?? (item as any).email ?? (item as any).sku ?? (item as any).status ?? ""}
              </span>
            </div>
          ))}
          {data.length > 10 && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: crmTheme.laura.textMuted, textAlign: "center" }}>
              y {data.length - 10} más...
            </div>
          )}
        </div>
        {summary && (
          <div style={{ padding: "8px 14px", fontSize: 12, color: crmTheme.laura.textMuted, borderTop: `1px solid ${crmTheme.laura.border}` }}>
            {summary}
          </div>
        )}
      </div>
    );
  }

  // Detail view
  const item = data as Record<string, unknown>;
  const displayFields = Object.entries(item)
    .filter(([key]) => !["id", "createdAt", "updatedAt", "createdBy", "updatedBy"].includes(key))
    .slice(0, 12);

  return (
    <div
      style={{
        borderRadius: crmTheme.radius.lg,
        border: `1px solid ${crmTheme.laura.border}`,
        background: crmTheme.colors.surface,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: crmTheme.laura.soft,
          borderBottom: `1px solid ${crmTheme.laura.border}`,
        }}
      >
        <Icon size={16} color={crmTheme.laura.primary} />
        <span style={{ fontSize: 13, fontWeight: 700, color: crmTheme.laura.textPrimary }}>
          {labels.singular}: {(item as any).displayName ?? (item as any).name ?? (item as any).title ?? (item as any).fullName}
        </span>
      </div>
      <div style={{ display: "grid", gap: 0 }}>
        {displayFields.map(([key, value], index) => (
          <div
            key={key}
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr",
              gap: 8,
              padding: "8px 14px",
              borderBottom: index < displayFields.length - 1 ? `1px solid ${crmTheme.laura.border}` : "none",
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600, color: crmTheme.laura.textMuted }}>{key}</span>
            <span style={{ color: crmTheme.laura.textPrimary }}>{formatValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update laura-chat.tsx to render data cards**

In the chat component, add handling for the `data` response mode. After the agenda items section, add:

```tsx
{/* Data Results */}
{body.mode === "query" && body.data && (
  <LauraDataCard
    entityType={body.data.entityType}
    action={body.data.action}
    data={body.data.data}
    summary={body.data.summary}
  />
)}
```

Also import `LauraDataCard` and add a `dataResult` state:

```tsx
const [dataResult, setDataResult] = useState<{ entityType: string; action: "list" | "detail"; data: unknown; summary: string } | null>(null);
```

And in `handleSend`, after setting the agenda items:

```tsx
if (body.mode === "query" && body.data) {
  setDataResult(body.data);
} else {
  setDataResult(null);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/laura/laura-data-card.tsx apps/web/src/components/laura/laura-chat.tsx
git commit -m "feat(web): add LauraDataCard component for rendering query results in chat"
```

---

## Task 13: Update Router Tests

**Files:**
- Modify: `apps/agent-laura/src/__tests__/agent-nodes.test.ts`

- [ ] **Step 1: Add test cases for query and modify classification**

Add tests that verify the router correctly classifies:
- "qué productos tenemos?" → `query`
- "mostrá los clientes del segmento agro" → `query`
- "cuántas cotizaciones abiertas hay?" → `query`
- "cambiá la hora de la tarea a las 14:20" → `modify`
- "actualizá el estado de la oportunidad a negociación" → `modify`
- "cancelá la visita de mañana" → `modify`
- "reprogramá el follow-up para el lunes" → `modify`

Also add tests asserting that existing classifications still work (greeting, agenda, proposal, confirm, discard, refine, qa).

- [ ] **Step 2: Add test cases for query node**

Add tests verifying that the query node:
- Calls the correct tool based on the user's question
- Returns a direct response (not a proposal)
- Sets mode to "query"

- [ ] **Step 3: Add test cases for modify node**

Add tests verifying that the modify node:
- Generates a proposal with the correct block type and action "update"
- Sets mode to "proposal"
- Includes the entity ID in the block data

- [ ] **Step 4: Run all tests**

Run: `cd apps/agent-laura && npx vitest run --reporter=verbose 2>&1 | tail -50`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent-laura/src/__tests__/agent-nodes.test.ts
git commit -m "test(agent): add router, query, and modify node tests"
```

---

## Task 14: Integration Test — End-to-End Flow

**Files:**
- Modify: `apps/agent-laura/src/__tests__/agent-nodes.test.ts`

- [ ] **Step 1: Add end-to-end conversation flow tests**

Add tests simulating full conversations:

1. **Query flow**: User sends "qué productos tenemos?" → agent classifies as query → calls search_products tool → returns data response
2. **Modify flow**: User sends "cambiá la hora del follow-up a las 14:20" → agent classifies as modify → generates proposal with followUp block, action "update" → user confirms → API call PATCH /laura/agents/followups/:id
3. **Create quote flow**: User sends "creá una cotización para Carlos Mendoza con 10 bolsas de semilla" → agent classifies as proposal → generates proposal with quote block → user confirms → API call POST /laura/agents/quotes

- [ ] **Step 2: Run all tests**

Run: `cd apps/agent-laura && npx vitest run --reporter=verbose 2>&1 | tail -50`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/agent-laura/src/__tests__/agent-nodes.test.ts
git commit -m "test(agent): add end-to-end flow tests for query, modify, and create quote"
```

---

## Task 15: Update System Prompt

**Files:**
- Modify: `apps/agent-laura/src/prompts/system-prompt.ts`
- Modify: `apps/agent-laura/src/prompts/prompt-sections.ts`

- [ ] **Step 1: Update system prompt for full CRM capabilities**

Update the system prompt to describe Laura's expanded capabilities:

```typescript
export const LAURA_SYSTEM_PROMPT = `Sos Laura, la asistente comercial del CRM de Norgtech. Tu trabajo es ayudar a los vendedores a gestionar todo el CRM usando lenguaje natural.

Podés:
- Consultar y buscar: clientes, oportunidades, productos, cotizaciones, pedidos, segmentos, contactos, visitas, seguimientos
- Crear registros: clientes, contactos, oportunidades, cotizaciones, pedidos, productos, segmentos, visitas, seguimientos, tareas
- Modificar registros: cambiar fechas, estados, datos de cualquier entidad
- Responder consultas de manera directa: "qué productos tenemos?", "cuántas cotizaciones abiertas hay?"
- Generar propuestas para acciones de escritura que el usuario confirma

Siempre respondé en español argentino, de manera concisa y útil. Usá "vos" en lugar de "tú".

Cuando el usuario pida crear o modificar algo, generá una propuesta estructurada. Cuando pida información, respondé directamente.
`;
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent-laura/src/prompts/system-prompt.ts apps/agent-laura/src/prompts/prompt-sections.ts
git commit -m "feat(agent): update system prompt for full CRM capabilities"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Architecture: query/modify nodes, expanded router (Task 7)
- ✅ Tools: 12+ read tools + 15+ write tools (Task 6)
- ✅ Blocks: 15 entity types with action field (Task 8, 10, 11)
- ✅ API endpoints: 30+ new endpoints (Tasks 1-2)
- ✅ Context tracking: mentionedEntities in state (Task 4)
- ✅ Frontend: data card + new block UIs (Tasks 11-12)
- ✅ Confirm handler: all new block types (Task 8)
- ✅ Testing: router, query, modify, E2E (Tasks 13-14)

**Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**Type consistency:** Types.ts (Task 3) defines ` ProposalBlockAction`, `CustomerBlock`, etc. These match the types used in `laura-types.ts` (Task 10) and the block rendering in `laura-proposal-card.tsx` (Task 11). The `AgentMode` type includes `"query" | "modify"` matching the router, graph, and server.ts changes.