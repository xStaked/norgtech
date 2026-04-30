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
  LauraAssistantResponse,
  LauraProposalConfirmationResponse,
  LauraSessionResponse,
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

const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";

describe("Laura", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let sessions: SessionRecord[];
  let messages: MessageRecord[];
  let proposals: ProposalRecord[];
  let visits: Array<Record<string, unknown>>;
  let followUpTasks: Array<Record<string, unknown>>;

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
        customer: {
          status: "resolved",
          selectedOption: {
            id: "customer-acme",
            label: "Acme Piscicola SAS",
          },
        },
        summary: "Resumen",
        suggestedActions: ["Programar visita comercial"],
      },
      createdAt: overrides.createdAt ?? new Date("2026-04-30T00:00:00.000Z"),
      updatedAt: overrides.updatedAt ?? new Date("2026-04-30T00:00:00.000Z"),
    };
    proposals.push(proposal);
    return proposal;
  };

  beforeAll(async () => {
    sessions = [];
    messages = [];
    proposals = [];
    visits = [];
    followUpTasks = [];

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
        findMany: async () => [],
        findUnique: async () => null,
      },
      visit: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const visit = {
            id: `visit-${visits.length + 1}`,
            ...data,
          };
          visits.push(visit);
          return visit;
        },
      },
      followUpTask: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const task = {
            id: `follow-up-task-${followUpTasks.length + 1}`,
            ...data,
          };
          followUpTasks.push(task);
          return task;
        },
      },
      lauraSession: {
        create: async ({ data }: { data: Partial<SessionRecord> }) => {
          return seedSession(data);
        },
        findUnique: async ({
          where,
        }: {
          where: { id: string };
        }) => {
          return sessions.find((session) => session.id === where.id) ?? null;
        },
      },
      lauraMessage: {
        create: async ({ data }: { data: Omit<MessageRecord, "id" | "createdAt"> & Partial<Pick<MessageRecord, "createdAt">> }) => {
          return seedMessage(data);
        },
        findMany: async ({
          where,
        }: {
          where: { sessionId: string };
          orderBy?: { createdAt: "asc" | "desc" };
        }) => {
          return messages
            .filter((message) => message.sessionId === where.sessionId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        },
      },
      lauraProposal: {
        create: async ({ data }: { data: Omit<ProposalRecord, "id" | "createdAt" | "updatedAt"> & Partial<Pick<ProposalRecord, "createdAt" | "updatedAt">> }) => {
          return seedProposal(data);
        },
        findUnique: async ({
          where,
        }: {
          where: { id: string };
        }) => {
          return proposals.find((proposal) => proposal.id === where.id) ?? null;
        },
        findMany: async ({
          where,
        }: {
          where: { sessionId: string };
          orderBy?: { createdAt: "asc" | "desc" };
        }) => {
          return proposals
            .filter((proposal) => proposal.sessionId === where.sessionId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ProposalRecord>;
        }) => {
          const index = proposals.findIndex((proposal) => proposal.id === where.id);
          if (index === -1) {
            throw new Error("Proposal not found");
          }

          proposals[index] = {
            ...proposals[index],
            ...data,
            updatedAt: new Date("2026-04-30T01:00:00.000Z"),
          };

          return proposals[index];
        },
      },
      auditLog: {
        create: async () => null,
      },
      $transaction: async <T>(
        callback: (tx: {
          lauraSession: typeof prismaStub.lauraSession;
          lauraMessage: typeof prismaStub.lauraMessage;
          lauraProposal: typeof prismaStub.lauraProposal;
        }) => Promise<T>,
      ) => {
        return callback({
          lauraSession: prismaStub.lauraSession as typeof prismaStub.lauraSession,
          lauraMessage: prismaStub.lauraMessage as typeof prismaStub.lauraMessage,
          lauraProposal: prismaStub.lauraProposal as typeof prismaStub.lauraProposal,
        });
      },
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
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

  it("returns a deterministic structured proposal payload for a free-form report", async () => {
    seedSession({
      id: "session-existing",
      ownerUserId: "admin-user-id",
    });

    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        sessionId: "session-existing",
        content: "Cliente Acme confirmó interés en 20 toneladas de alimento y pide visita el viernes.",
      })
      .expect(201);

    const body = response.body as LauraAssistantResponse;
    const expected: Extract<LauraAssistantResponse, { mode: "proposal" }> = {
      mode: "proposal",
      sessionId: "session-existing",
      message: "Preparé una propuesta inicial para que la revises antes de guardarla.",
      proposalId: expect.any(String) as unknown as string,
      proposal: {
        customer: {
          status: "resolved",
          selectedOption: {
            id: "customer-acme",
            label: "Acme Piscicola SAS",
          },
        },
        summary: "Cliente Acme confirmó interés en 20 toneladas de alimento y pide visita el viernes.",
        suggestedActions: [
          "Programar visita comercial",
          "Preparar propuesta para alimento",
        ],
      },
    };

    expect(body).toMatchObject(expected);
  });

  it("rejects sending a message to a session owned by another user", async () => {
    seedSession({
      id: "session-foreign",
      ownerUserId: "seller-user-id",
    });

    await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        sessionId: "session-foreign",
        content: "Seguimiento privado",
      })
      .expect(403);
  });

  it("returns a clarification payload for ambiguous customer mentions and does not create CRM records", async () => {
    const response = await request(globalThis.__LAURA_APP__)
      .post("/laura/messages")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        content: "Hablé con el cliente Perez y quiere retomar la propuesta.",
      })
      .expect(201);

    const body = response.body as LauraAssistantResponse;
    const expected: Extract<LauraAssistantResponse, { mode: "clarification" }> = {
      mode: "clarification",
      sessionId: expect.any(String) as unknown as string,
      message: "Encontré varios clientes que coinciden con Perez. ¿Cuál es?",
      clarification: {
        type: "customer",
        options: [
          { id: "customer-perez-a", label: "Perez Acuicola SAS" },
          { id: "customer-perez-b", label: "Perez Trading" },
        ],
      },
    };

    expect(body).toMatchObject(expected);
    expect(visits).toHaveLength(0);
    expect(followUpTasks).toHaveLength(0);
  });

  it("confirms a proposal for a session owned by the current user", async () => {
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
      status: LauraProposalStatus.draft,
      payload: {
        customer: {
          status: "resolved",
          selectedOption: {
            id: "customer-acme",
            label: "Acme Piscicola SAS",
          },
        },
        summary: "Reporte base",
        suggestedActions: ["Programar visita comercial"],
      },
    });

    const response = await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: proposal.payload,
      })
      .expect(201);

    const body = response.body as LauraProposalConfirmationResponse;

    expect(body).toMatchObject({
      proposalId: proposal.id,
      status: "confirmed",
      proposal: proposal.payload,
    });
    expect(proposals.find((item) => item.id === proposal.id)?.status).toBe(LauraProposalStatus.confirmed);
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
        proposal: proposal.payload,
      })
      .expect(403);
  });

  it("rejects confirming an already finalized proposal", async () => {
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
    });

    await request(globalThis.__LAURA_APP__)
      .post(`/laura/proposals/${proposal.id}/confirm`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .send({
        proposal: proposal.payload,
      })
      .expect(409);
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

  it("rejects malformed Task 1 proposal payloads", async () => {
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
          summary: 123,
          suggestedActions: "not-an-array",
        },
      })
      .expect(400);
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
      payload: {
        customer: {
          status: "resolved",
          selectedOption: {
            id: "customer-acme",
            label: "Acme Piscicola SAS",
          },
        },
        summary: "Reporte leido",
        suggestedActions: ["Programar visita comercial"],
      },
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

  it("rejects reading a session owned by another user", async () => {
    seedSession({
      id: "session-foreign-read",
      ownerUserId: "seller-user-id",
    });

    await request(globalThis.__LAURA_APP__)
      .get("/laura/sessions/session-foreign-read")
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .expect(403);
  });

  it("rejects invalid query boolean values", async () => {
    const session = seedSession({
      id: "session-invalid-query",
      ownerUserId: "admin-user-id",
    });

    await request(globalThis.__LAURA_APP__)
      .get(`/laura/sessions/${session.id}?includeMessages=abc`)
      .set("Authorization", `Bearer ${globalThis.__LAURA_ADMIN_TOKEN__}`)
      .expect(400);
  });
});
