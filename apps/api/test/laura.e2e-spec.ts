import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  LauraMessageKind,
  LauraMessageRole,
  LauraProposalStatus,
  UserRole,
} from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import {
  DeterministicLauraExtractorProvider,
  LAURA_EXTRACTOR_PROVIDER,
} from "../src/modules/laura/laura-llm.service";
import {
  LauraAssistantResponse,
  LauraProposalConfirmationResponse,
  LauraProposalPayload,
  LauraSessionResponse,
  LauraStoredProposalPayload,
} from "../src/modules/laura/laura.types";
import { PrismaService } from "../src/prisma/prisma.service";

declare global {
  // eslint-disable-next-line no-var
  var __LAURA_APP__: ReturnType<INestApplication["getHttpServer"]> | undefined;
  // eslint-disable-next-line no-var
  var __LAURA_ADMIN_TOKEN__: string | undefined;
}

type SessionRecord = {
  id: string;
  ownerUserId: string;
  contextType?: string | null;
  contextEntityId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRecord = {
  id: string;
  sessionId: string;
  role: LauraMessageRole;
  kind: LauraMessageKind;
  content: string;
  payload?: unknown;
  createdAt: Date;
};

type ProposalRecord = {
  id: string;
  sessionId: string;
  messageId: string;
  status: LauraProposalStatus;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerRecord = {
  id: string;
  displayName: string;
  legalName: string;
  contacts: Array<{
    id: string;
    fullName: string;
  }>;
};

type OpportunityRecord = {
  id: string;
  customerId: string;
  title: string;
  stage: string;
};

type VisitRecord = {
  id: string;
  customerId: string;
  opportunityId?: string;
  scheduledAt: Date;
  status?: string;
  summary?: string;
  notes?: string;
  nextStep?: string;
  assignedToUserId?: string;
  createdBy?: string;
  updatedBy?: string;
};

type FollowUpTaskRecord = {
  id: string;
  customerId: string;
  opportunityId?: string;
  title: string;
  dueAt: Date;
  type?: string;
  status?: string;
  notes?: string;
  assignedToUserId?: string;
  createdBy?: string;
  updatedBy?: string;
};

const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";

describe("Laura", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let sessions: SessionRecord[];
  let messages: MessageRecord[];
  let proposals: ProposalRecord[];
  let visits: VisitRecord[];
  let followUpTasks: FollowUpTaskRecord[];
  let customers: CustomerRecord[];
  let opportunities: OpportunityRecord[];
  let extractorResponses: Record<string, string>;

  const seedSession = (overrides: Partial<SessionRecord> = {}): SessionRecord => {
    const session: SessionRecord = {
      id: overrides.id ?? `session-${sessions.length + 1}`,
      ownerUserId: overrides.ownerUserId ?? "admin-user-id",
      contextType: overrides.contextType ?? null,
      contextEntityId: overrides.contextEntityId ?? null,
      createdAt: overrides.createdAt ?? new Date("2026-04-30T00:00:00.000Z"),
      updatedAt: overrides.updatedAt ?? new Date("2026-04-30T00:00:00.000Z"),
    };
    sessions.push(session);
    return session;
  };

  const seedMessage = (overrides: Partial<MessageRecord> = {}): MessageRecord => {
    const message: MessageRecord = {
      id: overrides.id ?? `message-${messages.length + 1}`,
      sessionId: overrides.sessionId ?? "session-1",
      role: overrides.role ?? LauraMessageRole.user,
      kind: overrides.kind ?? LauraMessageKind.report,
      content: overrides.content ?? "Mensaje",
      payload: overrides.payload,
      createdAt: overrides.createdAt ?? new Date("2026-04-30T00:00:00.000Z"),
    };
    messages.push(message);
    return message;
  };

  const seedProposal = (overrides: Partial<ProposalRecord> = {}): ProposalRecord => {
    const proposal: ProposalRecord = {
      id: overrides.id ?? `proposal-${proposals.length + 1}`,
      sessionId: overrides.sessionId ?? "session-1",
      messageId: overrides.messageId ?? "message-1",
      status: overrides.status ?? LauraProposalStatus.draft,
      payload: overrides.payload ?? {
        blocks: {
          interaction: {
            enabled: true,
            summary: "Resumen",
            rawMessage: "Resumen",
          },
          opportunity: {
            enabled: true,
            title: "Oportunidad Acme",
            stage: "contacto",
          },
          followUp: {
            enabled: true,
            title: "Programar visita comercial",
            dueAt: "2026-05-01T15:00:00.000Z",
            type: "reunion",
          },
          task: {
            enabled: true,
            title: "Preparar propuesta comercial",
          },
          signals: {
            enabled: true,
            objections: [],
            buyingIntent: "alto",
          },
        },
        internal: {
          customerId: "customer-acme",
          customerLabel: "Acme Piscicola SAS",
        },
      },
      createdAt: overrides.createdAt ?? new Date("2026-04-30T00:00:00.000Z"),
      updatedAt: overrides.updatedAt ?? new Date("2026-04-30T00:00:00.000Z"),
    };
    proposals.push(proposal);
    return proposal;
  };

  const toPublicProposal = (payload: unknown): LauraProposalPayload => {
    const stored = payload as LauraStoredProposalPayload;
    return {
      blocks: stored.blocks,
    };
  };

  const getStoredProposalInternal = (payload: unknown) => {
    return (payload as LauraStoredProposalPayload).internal;
  };

  const seedVisit = (overrides: Partial<VisitRecord> = {}): VisitRecord => {
    const visit: VisitRecord = {
      id: overrides.id ?? `visit-${visits.length + 1}`,
      customerId: overrides.customerId ?? "customer-acme",
      opportunityId: overrides.opportunityId,
      scheduledAt: overrides.scheduledAt ?? new Date("2026-05-01T15:00:00.000Z"),
      status: overrides.status ?? "programada",
      summary: overrides.summary,
      notes: overrides.notes,
      nextStep: overrides.nextStep,
      assignedToUserId: overrides.assignedToUserId,
      createdBy: overrides.createdBy ?? "admin-user-id",
      updatedBy: overrides.updatedBy ?? "admin-user-id",
    };
    visits.push(visit);
    return visit;
  };

  const seedFollowUpTask = (overrides: Partial<FollowUpTaskRecord> = {}): FollowUpTaskRecord => {
    const task: FollowUpTaskRecord = {
      id: overrides.id ?? `follow-up-task-${followUpTasks.length + 1}`,
      customerId: overrides.customerId ?? "customer-acme",
      opportunityId: overrides.opportunityId,
      title: overrides.title ?? "Seguimiento comercial",
      dueAt: overrides.dueAt ?? new Date("2026-05-01T10:00:00.000Z"),
      type: overrides.type ?? "llamada",
      status: overrides.status ?? "pendiente",
      notes: overrides.notes,
      assignedToUserId: overrides.assignedToUserId,
      createdBy: overrides.createdBy ?? "admin-user-id",
      updatedBy: overrides.updatedBy ?? "admin-user-id",
    };
    followUpTasks.push(task);
    return task;
  };

  beforeAll(async () => {
    sessions = [];
    messages = [];
    proposals = [];
    visits = [];
    followUpTasks = [];
    extractorResponses = {};
    customers = [
      {
        id: "customer-acme",
        displayName: "Acme Piscicola SAS",
        legalName: "Acme Piscicola SAS",
        contacts: [{ id: "contact-acme-1", fullName: "Laura Acosta" }],
      },
      {
        id: "customer-perez-a",
        displayName: "Perez Acuicola SAS",
        legalName: "Perez Acuicola SAS",
        contacts: [{ id: "contact-perez-a-1", fullName: "Juan Perez" }],
      },
      {
        id: "customer-perez-b",
        displayName: "Perez Trading",
        legalName: "Comercializadora Perez Trading SAS",
        contacts: [{ id: "contact-perez-b-1", fullName: "Patricia Gomez" }],
      },
      {
        id: "customer-lago",
        displayName: "Alimentos del Lago",
        legalName: "Alimentos del Lago SAS",
        contacts: [{ id: "contact-lago-1", fullName: "Carlos Mejia" }],
      },
    ];
    opportunities = [
      {
        id: "opportunity-lago-1",
        customerId: "customer-lago",
        title: "Negociacion Alimentos del Lago",
        stage: "contacto",
      },
    ];

    const user = {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email === "admin@norgtech.local" || where.id === "admin-user-id") {
          return {
            id: "admin-user-id",
            name: "Admin",
            email: "admin@norgtech.local",
            passwordHash,
            role: UserRole.administrador,
            active: true,
          };
        }

        if (where.email === "seller@norgtech.local" || where.id === "seller-user-id") {
          return {
            id: "seller-user-id",
            name: "Seller",
            email: "seller@norgtech.local",
            passwordHash,
            role: UserRole.comercial,
            active: true,
          };
        }

        return null;
      },
    };

    const prismaStub: Record<string, unknown> = {
      user,
      customer: {
        findMany: async () => customers,
        findUnique: async ({ where }: { where: { id: string } }) => {
          return customers.find((customer) => customer.id === where.id) ?? null;
        },
      },
      opportunity: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          return opportunities.find((opportunity) => opportunity.id === where.id) ?? null;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const opportunity = {
            id: `opportunity-${opportunities.length + 1}`,
            ...data,
          } as OpportunityRecord;
          opportunities.push(opportunity);
          return opportunity;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; stage?: string };
          data: Partial<OpportunityRecord>;
        }) => {
          const index = opportunities.findIndex((opportunity) =>
            opportunity.id === where.id && (!where.stage || opportunity.stage === where.stage),
          );

          if (index === -1) {
            return { count: 0 };
          }

          opportunities[index] = {
            ...opportunities[index],
            ...data,
          };

          return { count: 1 };
        },
      },
      visit: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          return seedVisit(data as Partial<VisitRecord>);
        },
        findMany: async () => visits,
      },
      followUpTask: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          return seedFollowUpTask(data as Partial<FollowUpTaskRecord>);
        },
        findMany: async () => followUpTasks,
      },
      lauraSession: {
        create: async ({ data }: { data: Partial<SessionRecord> }) => seedSession(data),
        findUnique: async ({ where }: { where: { id: string } }) => {
          return sessions.find((session) => session.id === where.id) ?? null;
        },
      },
      lauraMessage: {
        create: async ({ data }: { data: Omit<MessageRecord, "id" | "createdAt"> & Partial<Pick<MessageRecord, "createdAt">> }) => {
          return seedMessage(data);
        },
        findMany: async ({
          where,
          take,
          orderBy,
        }: {
          where: { sessionId: string };
          take?: number;
          orderBy?: { createdAt: "asc" | "desc" };
        }) => {
          const sorted = messages
            .filter((message) => message.sessionId === where.sessionId)
            .sort((a, b) => {
              if (orderBy?.createdAt === "desc") {
                return b.createdAt.getTime() - a.createdAt.getTime();
              }

              return a.createdAt.getTime() - b.createdAt.getTime();
            });

          return typeof take === "number" ? sorted.slice(0, take) : sorted;
        },
      },
      lauraProposal: {
        create: async ({ data }: { data: Omit<ProposalRecord, "id" | "createdAt" | "updatedAt"> & Partial<Pick<ProposalRecord, "createdAt" | "updatedAt">> }) => {
          return seedProposal(data);
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          return proposals.find((proposal) => proposal.id === where.id) ?? null;
        },
        findMany: async ({
          where,
          take,
          orderBy,
        }: {
          where: { sessionId: string };
          take?: number;
          orderBy?: { createdAt: "asc" | "desc" };
        }) => {
          const sorted = proposals
            .filter((proposal) => proposal.sessionId === where.sessionId)
            .sort((a, b) => {
              if (orderBy?.createdAt === "desc") {
                return b.createdAt.getTime() - a.createdAt.getTime();
              }

              return a.createdAt.getTime() - b.createdAt.getTime();
            });

          return typeof take === "number" ? sorted.slice(0, take) : sorted;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; status: LauraProposalStatus };
          data: Partial<ProposalRecord>;
        }) => {
          const index = proposals.findIndex((proposal) =>
            proposal.id === where.id && proposal.status === where.status,
          );

          if (index === -1) {
            return { count: 0 };
          }

          proposals[index] = {
            ...proposals[index],
            ...data,
            updatedAt: new Date("2026-04-30T01:00:00.000Z"),
          };

          return { count: 1 };
        },
      },
      auditLog: {
        create: async () => null,
      },
      $transaction: async <T>(
        callback: (tx: {
          customer: typeof prismaStub.customer;
          opportunity: typeof prismaStub.opportunity;
          visit: typeof prismaStub.visit;
          followUpTask: typeof prismaStub.followUpTask;
          auditLog: typeof prismaStub.auditLog;
          lauraSession: typeof prismaStub.lauraSession;
          lauraMessage: typeof prismaStub.lauraMessage;
          lauraProposal: typeof prismaStub.lauraProposal;
        }) => Promise<T>,
      ) => {
        return callback({
          customer: prismaStub.customer as typeof prismaStub.customer,
          opportunity: prismaStub.opportunity as typeof prismaStub.opportunity,
          visit: prismaStub.visit as typeof prismaStub.visit,
          followUpTask: prismaStub.followUpTask as typeof prismaStub.followUpTask,
          auditLog: prismaStub.auditLog as typeof prismaStub.auditLog,
          lauraSession: prismaStub.lauraSession as typeof prismaStub.lauraSession,
          lauraMessage: prismaStub.lauraMessage as typeof prismaStub.lauraMessage,
          lauraProposal: prismaStub.lauraProposal as typeof prismaStub.lauraProposal,
        });
      },
    };

    const deterministicExtractorProvider = new DeterministicLauraExtractorProvider();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .overrideProvider(LAURA_EXTRACTOR_PROVIDER)
      .useValue({
        extract: async (input: {
          message: string;
          contextSummary?: string;
          recentMessages: string[];
          systemPrompt: string;
        }) => {
          return extractorResponses[input.message]
            ?? deterministicExtractorProvider.extract(input);
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    globalThis.__LAURA_APP__ = app.getHttpServer();

    const loginResponse = await request(globalThis.__LAURA_APP__)
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    globalThis.__LAURA_ADMIN_TOKEN__ = loginResponse.body.accessToken;
  });

  beforeEach(() => {
    sessions.length = 0;
    messages.length = 0;
    proposals.length = 0;
    visits.length = 0;
    followUpTasks.length = 0;
    extractorResponses = {};
    opportunities = [
      {
        id: "opportunity-lago-1",
        customerId: "customer-lago",
        title: "Negociacion Alimentos del Lago",
        stage: "contacto",
      },
    ];
  });

  afterAll(async () => {
    globalThis.__LAURA_ADMIN_TOKEN__ = undefined;
    globalThis.__LAURA_APP__ = undefined;

    if (app) {
      await app.close();
    }
  });

  it("creates a session when a message is sent without sessionId", async () => {
    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        content: "Visite a Acme hoy y necesitan una propuesta para tilapia.",
      })
      .expect(201);

    const body = response.body as LauraAssistantResponse;

    expect(body.sessionId).toBeDefined();
    expect(body.mode).toBe("proposal");
    expect(sessions).toHaveLength(1);
    expect(messages).toHaveLength(2);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.messageId).toBe(messages[0]?.id);
  });

  it("returns a clarification payload for ambiguous customer mentions and does not create CRM records", async () => {
    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        content: "Hable con el cliente Perez y quiere retomar la propuesta.",
      })
      .expect(201);

    const body = response.body as LauraAssistantResponse;

    expect(body).toMatchObject({
      mode: "clarification",
      message: "Encontré varios clientes que coinciden con Perez. ¿Cuál es?",
      clarification: {
        type: "customer",
        options: [
          { id: "customer-perez-a", label: "Perez Acuicola SAS" },
          { id: "customer-perez-b", label: "Perez Trading" },
        ],
      },
    });
    expect(visits).toHaveLength(0);
    expect(followUpTasks).toHaveLength(0);
  });

  it("uses the pending clarification in session memory when the follow-up says si, el primero", async () => {
    const clarificationResponse = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        content: "Hable con el cliente Perez y quiere retomar la propuesta.",
      })
      .expect(201);

    const clarification = clarificationResponse.body as Extract<LauraAssistantResponse, { mode: "clarification" }>;

    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        sessionId: clarification.sessionId,
        content: "si, el primero",
      })
      .expect(201);

    const body = response.body as Extract<LauraAssistantResponse, { mode: "proposal" }>;
    const storedProposal = proposals.at(-1)?.payload;

    expect(getStoredProposalInternal(storedProposal)).toMatchObject({
      customerId: "customer-perez-a",
      customerLabel: "Perez Acuicola SAS",
    });
  });

  it("resolves the linked customer when launched from an opportunity and the text does not name another customer", async () => {
    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        contextType: "opportunity",
        contextEntityId: "opportunity-lago-1",
        content: "Quiere revisar condiciones comerciales la proxima semana.",
      })
      .expect(201);

    const body = response.body as Extract<LauraAssistantResponse, { mode: "proposal" }>;
    const storedProposal = proposals.at(-1)?.payload;

    expect(body.proposal.blocks.opportunity).toMatchObject({
      opportunityId: "opportunity-lago-1",
      createNew: false,
    });
    expect(body.proposal.blocks.followUp).toMatchObject({
      opportunityId: "opportunity-lago-1",
    });
    expect(getStoredProposalInternal(storedProposal)).toMatchObject({
      customerId: "customer-lago",
      customerLabel: "Alimentos del Lago",
      opportunityId: "opportunity-lago-1",
    });
  });

  it("leaves customer references empty when neither text nor context resolves deterministically", async () => {
    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        contextType: "opportunity",
        contextEntityId: "opportunity-missing",
        content: "Necesita seguimiento comercial pronto.",
      })
      .expect(201);

    const body = response.body as Extract<LauraAssistantResponse, { mode: "proposal" }>;
    const storedProposal = proposals.at(-1)?.payload;

    expect(getStoredProposalInternal(storedProposal)?.customerId).toBeUndefined();
    expect(body.proposal.blocks.interaction?.enabled).toBe(false);
    expect(body.proposal.blocks.followUp?.enabled).toBe(false);
    expect(body.proposal.blocks.opportunity?.enabled).toBe(false);
  });

  it("returns normalized proposal blocks for editable confirmation", async () => {
    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        content: "Cliente Acme confirmó interés en 20 toneladas de alimento y pide visita el viernes.",
      })
      .expect(201);

    const body = response.body as Extract<LauraAssistantResponse, { mode: "proposal" }>;

    expect(body).toMatchObject({
      mode: "proposal",
      proposal: {
        blocks: {
          interaction: {
            enabled: true,
            rawMessage: "Cliente Acme confirmó interés en 20 toneladas de alimento y pide visita el viernes.",
          },
          opportunity: {
            enabled: true,
            createNew: true,
          },
          followUp: {
            enabled: true,
            type: "reunion",
          },
          task: {
            enabled: true,
          },
          signals: {
            enabled: true,
            objections: [],
            buyingIntent: "alto",
          },
        },
      },
    });
    expect(body.proposal.blocks.interaction).not.toHaveProperty("customerId");
    expect(body.proposal.blocks.interaction).not.toHaveProperty("customerLabel");
    expect(body.proposal.blocks.opportunity).not.toHaveProperty("customerId");
    expect(body.proposal.blocks.followUp).not.toHaveProperty("customerId");
    expect(body.proposal.blocks.interaction?.summary).toContain("20 toneladas");
    expect(body.proposal.blocks.followUp?.dueAt).toEqual(expect.any(String));
  });

  it("returns prioritized agenda items from existing visits and follow-up tasks without creating records", async () => {
    seedFollowUpTask({
      id: "follow-up-task-urgent",
      customerId: "customer-acme",
      title: "Llamar a Acme por pago pendiente",
      dueAt: new Date("2026-04-30T09:00:00.000Z"),
      assignedToUserId: "admin-user-id",
      status: "pendiente",
    });
    seedVisit({
      id: "visit-soon",
      customerId: "customer-lago",
      scheduledAt: new Date("2026-04-30T11:00:00.000Z"),
      assignedToUserId: "admin-user-id",
      status: "programada",
      summary: "Visita tecnica Alimentos del Lago",
    });
    seedFollowUpTask({
      id: "follow-up-task-later",
      customerId: "customer-lago",
      title: "Enviar propuesta actualizada",
      dueAt: new Date("2026-04-30T17:00:00.000Z"),
      assignedToUserId: "admin-user-id",
      status: "pendiente",
    });

    const previousVisitCount = visits.length;
    const previousTaskCount = followUpTasks.length;
    const previousProposalCount = proposals.length;

    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        content: "Laura, que tengo en la agenda hoy y cuales son mis prioridades?",
      })
      .expect(201);

    const body = response.body as Extract<LauraAssistantResponse, { mode: "agenda" }>;

    expect(body).toMatchObject({
      mode: "agenda",
      agenda: {
        items: [
          {
            id: "follow-up-task-urgent",
            type: "follow_up_task",
            label: expect.stringContaining("Llamar a Acme por pago pendiente"),
          },
          {
            id: "visit-soon",
            type: "visit",
            label: expect.stringContaining("Visita tecnica Alimentos del Lago"),
          },
          {
            id: "follow-up-task-later",
            type: "follow_up_task",
            label: expect.stringContaining("Enviar propuesta actualizada"),
          },
        ],
      },
    });
    expect(visits).toHaveLength(previousVisitCount);
    expect(followUpTasks).toHaveLength(previousTaskCount);
    expect(proposals).toHaveLength(previousProposalCount);
  });

  it("confirms only approved blocks and persists interaction and follow-up without touching opportunity stage", async () => {
    const session = seedSession({
      id: "session-confirm",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-confirm",
      sessionId: session.id,
      role: LauraMessageRole.user,
      kind: LauraMessageKind.report,
      content: "Reporte base",
    });
    const proposal = seedProposal({
      id: "proposal-confirm",
      sessionId: session.id,
      messageId: message.id,
      payload: {
        blocks: {
          interaction: {
            enabled: true,
            summary: "Reporte base Acme",
            rawMessage: "Reporte base Acme",
          },
          opportunity: {
            enabled: false,
            opportunityId: "opportunity-lago-1",
            stage: "visita",
          },
          followUp: {
            enabled: true,
            title: "Programar visita comercial",
            dueAt: "2026-05-01T15:00:00.000Z",
            type: "reunion",
          },
          task: {
            enabled: false,
            title: "Enviar propuesta",
          },
          signals: {
            enabled: false,
            objections: [],
            buyingIntent: "alto",
          },
        },
        internal: {
          customerId: "customer-acme",
          customerLabel: "Acme Piscicola SAS",
        },
      },
    });

    const response = await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: toPublicProposal(proposal.payload),
      })
      .expect(201);

    const body = response.body as LauraProposalConfirmationResponse;

    expect(body).toMatchObject({
      proposalId: proposal.id,
      status: "confirmed",
      proposal: toPublicProposal(proposal.payload),
      saved: ["interaction", "followUp"],
      discarded: ["opportunity", "task", "signals"],
    });
    expect(body.createdIds.interaction).toEqual(expect.any(String));
    expect(body.createdIds.followUp).toEqual(expect.any(String));
    expect(proposals.find((item) => item.id === proposal.id)?.status).toBe(LauraProposalStatus.confirmed);
    expect(visits).toHaveLength(1);
    expect(followUpTasks).toHaveLength(1);
    expect(opportunities.find((item) => item.id === "opportunity-lago-1")?.stage).toBe("contacto");
  });

  it("does not leak rejected follow-up or signals data into the persisted visit", async () => {
    const session = seedSession({
      id: "session-rejected-blocks",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-rejected-blocks",
      sessionId: session.id,
      role: LauraMessageRole.user,
      kind: LauraMessageKind.report,
      content: "Reporte sin persistir extras",
    });
    const proposal = seedProposal({
      id: "proposal-rejected-blocks",
      sessionId: session.id,
      messageId: message.id,
      payload: {
        blocks: {
          interaction: {
            enabled: true,
            summary: "Reporte sin persistir extras Acme",
            rawMessage: "Reporte sin persistir extras Acme",
          },
          followUp: {
            enabled: false,
            title: "No persistir este siguiente paso",
            dueAt: "2026-05-02T15:00:00.000Z",
            type: "llamada",
          },
          signals: {
            enabled: false,
            objections: ["precio"],
            risk: "alto",
            buyingIntent: "medio",
          },
        },
        internal: {
          customerId: "customer-acme",
          customerLabel: "Acme Piscicola SAS",
        },
      },
    });

    await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: toPublicProposal(proposal.payload),
      })
      .expect(201);

    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({
      summary: "Reporte sin persistir extras Acme",
      notes: "Mensaje original: Reporte sin persistir extras Acme",
    });
    expect(visits[0]?.nextStep).toBeUndefined();
  });

  it("creates a new approved opportunity before persisting the interaction", async () => {
    const session = seedSession({
      id: "session-create-new-opportunity",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-create-new-opportunity",
      sessionId: session.id,
      role: LauraMessageRole.user,
      kind: LauraMessageKind.report,
      content: "Reporte con oportunidad nueva",
    });
    const proposal = seedProposal({
      id: "proposal-create-new-opportunity",
      sessionId: session.id,
      messageId: message.id,
      payload: {
        blocks: {
          interaction: {
            enabled: true,
            summary: "Reporte con oportunidad nueva Acme",
            rawMessage: "Reporte con oportunidad nueva Acme",
          },
          opportunity: {
            enabled: true,
            createNew: true,
            title: 'Nueva oportunidad Laura',
            stage: "contacto",
          },
        },
        internal: {
          customerId: "customer-acme",
          customerLabel: "Acme Piscicola SAS",
        },
      },
    });

    const response = await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: toPublicProposal(proposal.payload),
      })
      .expect(201);

    const body = response.body as LauraProposalConfirmationResponse;

    expect(body.createdIds.opportunity).toEqual(expect.any(String));
    expect(visits).toHaveLength(1);
    expect(visits[0]?.opportunityId).toBe(body.createdIds.opportunity);
    expect(opportunities.find((item) => item.id === body.createdIds.opportunity)).toMatchObject({
      customerId: "customer-acme",
      title: "Nueva oportunidad Laura",
      stage: "contacto",
    });
  });

  it("does not create CRM side effects when confirming an already finalized proposal", async () => {
    const session = seedSession({
      id: "session-finalized-proposal",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-finalized-proposal",
      sessionId: session.id,
    });
    const proposal = seedProposal({
      id: "proposal-finalized",
      sessionId: session.id,
      messageId: message.id,
      status: LauraProposalStatus.confirmed,
      payload: {
        blocks: {
          interaction: {
            enabled: true,
            summary: "No deberia persistirse Acme",
            rawMessage: "No deberia persistirse Acme",
          },
          followUp: {
            enabled: true,
            title: "No deberia crearse",
            dueAt: "2026-05-02T15:00:00.000Z",
            type: "llamada",
          },
        },
        internal: {
          customerId: "customer-acme",
          customerLabel: "Acme Piscicola SAS",
        },
      },
    });

    await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: toPublicProposal(proposal.payload),
      })
      .expect(409);

    expect(visits).toHaveLength(0);
    expect(followUpTasks).toHaveLength(0);
  });

  it("rejects confirm-time opportunity target tampering against the stored Laura draft", async () => {
    const session = seedSession({
      id: "session-target-tampering",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-target-tampering",
      sessionId: session.id,
    });
    const proposal = seedProposal({
      id: "proposal-target-tampering",
      sessionId: session.id,
      messageId: message.id,
      payload: {
        blocks: {
          interaction: {
            enabled: true,
            summary: "Reporte base Lago",
            rawMessage: "Reporte base Lago",
          },
          opportunity: {
            enabled: true,
            opportunityId: "opportunity-lago-1",
            createNew: false,
            title: "Negociacion Alimentos del Lago",
            stage: "contacto",
          },
          followUp: {
            enabled: true,
            opportunityId: "opportunity-lago-1",
            title: "Programar visita comercial",
            dueAt: "2026-05-01T15:00:00.000Z",
            type: "reunion",
          },
        },
        internal: {
          customerId: "customer-lago",
          customerLabel: "Alimentos del Lago",
          opportunityId: "opportunity-lago-1",
        },
      },
    });

    await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: {
          blocks: {
            interaction: {
              enabled: true,
              summary: "Reporte base Lago editado",
              rawMessage: "Reporte base Lago editado",
            },
            opportunity: {
              enabled: true,
              opportunityId: "opportunity-forged",
              createNew: false,
              title: "Intento de secuestro",
              stage: "visita",
            },
            followUp: {
              enabled: true,
              opportunityId: "opportunity-forged",
              title: "Programar visita comercial",
              dueAt: "2026-05-01T15:00:00.000Z",
              type: "reunion",
            },
          },
        },
      })
      .expect(400);

    expect(visits).toHaveLength(0);
    expect(followUpTasks).toHaveLength(0);
    expect(opportunities.find((item) => item.id === "opportunity-lago-1")?.stage).toBe("contacto");
  });

  it("does not report task blocks as saved when this phase has no concrete persistence target", async () => {
    const session = seedSession({
      id: "session-task-unsaved",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-task-unsaved",
      sessionId: session.id,
    });
    const proposal = seedProposal({
      id: "proposal-task-unsaved",
      sessionId: session.id,
      messageId: message.id,
      payload: {
        blocks: {
          interaction: {
            enabled: true,
            summary: "Persistir solo interaccion Acme",
            rawMessage: "Persistir solo interaccion Acme",
          },
          task: {
            enabled: true,
            title: "Tarea sin destino real",
          },
        },
        internal: {
          customerId: "customer-acme",
          customerLabel: "Acme Piscicola SAS",
        },
      },
    });

    const response = await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: toPublicProposal(proposal.payload),
      })
      .expect(201);

    const body = response.body as LauraProposalConfirmationResponse;

    expect(body.saved).toEqual(["interaction"]);
    expect(body.discarded).toContain("task");
    expect(body.createdIds.task).toBeUndefined();
  });

  it("does not report signals as saved when no interaction was persisted", async () => {
    const session = seedSession({
      id: "session-signals-no-interaction",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-signals-no-interaction",
      sessionId: session.id,
    });
    const proposal = seedProposal({
      id: "proposal-signals-no-interaction",
      sessionId: session.id,
      messageId: message.id,
      payload: {
        blocks: {
          interaction: {
            enabled: false,
            summary: "No guardar interaccion",
            rawMessage: "No guardar interaccion Acme",
          },
          signals: {
            enabled: true,
            objections: ["precio"],
            risk: "alto",
          },
        },
        internal: {
          customerId: "customer-acme",
          customerLabel: "Acme Piscicola SAS",
        },
      },
    });

    const response = await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: toPublicProposal(proposal.payload),
      })
      .expect(201);

    const body = response.body as LauraProposalConfirmationResponse;

    expect(body.saved).toEqual([]);
    expect(body.discarded).toEqual(expect.arrayContaining(["interaction", "signals"]));
    expect(visits).toHaveLength(0);
  });

  it("surfaces Laura-created visits and follow-ups in a later agenda query for the same user", async () => {
    const session = seedSession({
      id: "session-agenda-after-confirm",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-agenda-after-confirm",
      sessionId: session.id,
    });
    const proposal = seedProposal({
      id: "proposal-agenda-after-confirm",
      sessionId: session.id,
      messageId: message.id,
      payload: {
        blocks: {
          interaction: {
            enabled: true,
            summary: "Seguimiento agenda Acme",
            rawMessage: "Seguimiento agenda Acme",
          },
          followUp: {
            enabled: true,
            title: "Llamar a Acme despues de visita",
            dueAt: "2026-05-01T15:00:00.000Z",
            type: "llamada",
          },
        },
        internal: {
          customerId: "customer-acme",
          customerLabel: "Acme Piscicola SAS",
        },
      },
    });

    const confirmResponse = await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: toPublicProposal(proposal.payload),
      })
      .expect(201);

    const confirmBody = confirmResponse.body as LauraProposalConfirmationResponse;

    expect(visits[0]?.assignedToUserId).toBe("admin-user-id");
    expect(followUpTasks[0]?.assignedToUserId).toBe("admin-user-id");

    const agendaResponse = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        content: "Laura, muéstrame mi agenda y prioridades",
      })
      .expect(201);

    const agendaBody = agendaResponse.body as Extract<LauraAssistantResponse, { mode: "agenda" }>;

    expect(agendaBody.agenda.items).toEqual(expect.arrayContaining([
      {
        id: confirmBody.createdIds.interaction,
        type: "visit",
        label: "Seguimiento agenda Acme",
      },
      {
        id: confirmBody.createdIds.followUp,
        type: "follow_up_task",
        label: "Llamar a Acme despues de visita",
      },
    ]));
  });

  it("rejects confirming a proposal tied to another user's session", async () => {
    const session = seedSession({
      id: "session-foreign-proposal",
      ownerUserId: "seller-user-id",
    });
    const message = seedMessage({
      id: "message-foreign-proposal",
      sessionId: session.id,
    });
    const proposal = seedProposal({
      id: "proposal-foreign",
      sessionId: session.id,
      messageId: message.id,
    });

    await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: toPublicProposal(proposal.payload),
      })
      .expect(403);
  });

  it("rejects invalid confirmProposal payloads", async () => {
    const session = seedSession({
      id: "session-invalid-confirm",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-invalid-confirm",
      sessionId: session.id,
    });
    const proposal = seedProposal({
      id: "proposal-invalid-confirm",
      sessionId: session.id,
      messageId: message.id,
    });

    await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: null,
      })
      .expect(400);
  });

  it("rejects malformed Task 3 proposal payloads", async () => {
    const session = seedSession({
      id: "session-malformed-confirm",
      ownerUserId: "admin-user-id",
    });
    const message = seedMessage({
      id: "message-malformed-confirm",
      sessionId: session.id,
    });
    const proposal = seedProposal({
      id: "proposal-malformed-confirm",
      sessionId: session.id,
      messageId: message.id,
    });

    await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: {
          blocks: {
            interaction: {
              enabled: true,
              summary: 123,
            },
          },
        },
      })
      .expect(400);
  });

  it("fails closed when the extractor returns malformed field types", async () => {
    extractorResponses["forzar payload invalido"] = JSON.stringify({
      intent: "report",
      interactionSummary: 123,
      suggestedOpportunityStage: "contacto",
      taskType: "llamada",
      signals: {
        objections: "precio",
      },
    });

    await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        content: "forzar payload invalido",
      })
      .expect(400);

    expect(proposals).toHaveLength(0);
    expect(visits).toHaveLength(0);
    expect(followUpTasks).toHaveLength(0);
  });

  it("returns a session owned by the current user", async () => {
    const session = seedSession({
      id: "session-read",
      ownerUserId: "admin-user-id",
      contextType: "customer",
      contextEntityId: "customer-acme",
    });
    const message = seedMessage({
      id: "message-read",
      sessionId: session.id,
      role: LauraMessageRole.user,
      kind: LauraMessageKind.report,
      content: "Reporte leido",
    });
    const proposal = seedProposal({
      id: "proposal-read",
      sessionId: session.id,
      messageId: message.id,
    });

    const response = await request(globalThis.__LAURA_APP__)
      .get(`/laura/sessions/${session.id}?includeMessages=true&includeProposals=true`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .expect(200);

    const body = response.body as LauraSessionResponse;

    expect(body).toMatchObject({
      id: session.id,
      ownerUserId: "admin-user-id",
      contextType: "customer",
      contextEntityId: "customer-acme",
    });
    expect(body.messages).toHaveLength(1);
    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0]?.id).toBe(proposal.id);
  });
});
