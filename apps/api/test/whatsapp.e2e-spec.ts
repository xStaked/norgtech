import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  NoraActionStatus,
  UserRole,
  WhatsAppConversationStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageRole,
  WhatsAppSenderType,
} from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("WhatsApp inbox", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  let adminToken: string;
  let originalFetch: typeof globalThis.fetch;

  const users = [
    {
      id: "admin-user-id",
      name: "Admin",
      email: "admin@norgtech.local",
      passwordHash,
      role: UserRole.administrador,
      active: true,
    },
    {
      id: "sales-user-id",
      name: "Sales",
      email: "sales@norgtech.local",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
  ];

  const customers = [
    { id: "customer-1", displayName: "Agro Norte" },
    { id: "customer-2", displayName: "Agro Sur" },
  ];
  const contacts = [
    {
      id: "contact-1",
      customerId: "customer-1",
      fullName: "Laura Cliente",
      phone: "+573001112233",
    },
    {
      id: "contact-2",
      customerId: "customer-2",
      fullName: "Carlos Cliente",
      phone: "+573004445566",
    },
  ];
  const conversations = [
    {
      id: "conversation-1",
      accountId: "account-1",
      waId: "573001112233",
      phone: "+573001112233",
      senderName: "Laura Cliente",
      senderType: WhatsAppSenderType.cliente,
      status: WhatsAppConversationStatus.nuevo,
      assignedToUserId: "sales-user-id",
      customerId: "customer-1",
      contactId: "contact-1",
      lastMessageAt: new Date("2026-05-22T10:00:00.000Z"),
      lastMessageText: "Necesito un pedido",
      createdAt: new Date("2026-05-22T09:00:00.000Z"),
      updatedAt: new Date("2026-05-22T10:00:00.000Z"),
    },
  ];
  const messages = [
    {
      id: "message-1",
      conversationId: "conversation-1",
      direction: WhatsAppMessageDirection.inbound,
      role: WhatsAppMessageRole.user,
      body: "Necesito un pedido",
      createdAt: new Date("2026-05-22T10:00:00.000Z"),
    },
  ];
  const notes = [
    {
      id: "note-1",
      conversationId: "conversation-1",
      authorUserId: "sales-user-id",
      body: "Cliente solicita prioridad",
      createdAt: new Date("2026-05-22T10:01:00.000Z"),
    },
  ];
  const tags = [
    {
      id: "tag-1",
      conversationId: "conversation-1",
      label: "pedido",
      createdAt: new Date("2026-05-22T10:02:00.000Z"),
    },
  ];
  const orders: Array<Record<string, unknown>> = [
    {
      id: "order-1",
      customerId: "customer-1",
      sourceConversationId: "conversation-1",
      orderNumber: "PED-000001",
      items: [{ id: "item-1", orderId: "order-1", productSnapshotName: "Fertilizante" }],
      customer: customers[0],
    },
  ];
  const auditLogs: Array<Record<string, unknown>> = [];
  const noraActions = [
    {
      id: "nora-action-1",
      conversationId: "conversation-1",
      mode: "pedidos",
      action: "draft_order",
      status: NoraActionStatus.proposed,
      input: { text: "pedido" },
      createdAt: new Date("2026-05-22T10:03:00.000Z"),
      updatedAt: new Date("2026-05-22T10:03:00.000Z"),
    },
  ];
  const accounts: Array<Record<string, unknown>> = [];

  const buildConversation = (
    conversation: Record<string, unknown>,
    include?: Record<string, unknown>,
  ) => {
    const result = { ...conversation } as Record<string, unknown>;

    if (include?.customer) {
      result.customer = customers.find((customer) => customer.id === conversation.customerId) ?? null;
    }
    if (include?.contact) {
      result.contact = contacts.find((contact) => contact.id === conversation.contactId) ?? null;
    }
    if (include?.assignedToUser) {
      result.assignedToUser =
        users.find((user) => user.id === conversation.assignedToUserId) ?? null;
    }
    if (include?.account) {
      result.account = accounts.find((account) => account.id === conversation.accountId) ?? {
        id: conversation.accountId,
        displayName: "WhatsApp",
        phoneNumber: "phone-number-1",
        phoneNumberId: "phone-number-1",
        active: true,
      };
    }
    if (include?.tags) {
      result.tags = tags.filter((tag) => tag.conversationId === conversation.id);
    }
    if (include?.notes) {
      result.notes = notes.filter((note) => note.conversationId === conversation.id);
    }
    if (include?.messages) {
      result.messages = messages.filter((message) => message.conversationId === conversation.id);
    }
    if (include?.orders) {
      result.orders = orders.filter((order) => order.sourceConversationId === conversation.id);
    }
    if (include?.noraActions) {
      result.noraActions = noraActions.filter(
        (action) => action.conversationId === conversation.id,
      );
    }

    return result;
  };

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        mode: "cliente",
        intent: "pedido",
        summary: "Cliente solicita 10 bultos de producto A para la costa.",
        suggested_reply: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
        requires_human_review: true,
        proposed_order: { items: [{ name: "producto A", quantity: 10 }] },
      }),
    })) as unknown as typeof globalThis.fetch;

    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
          users.find((user) => user.email === where.email || user.id === where.id) ?? null,
      },
      customer: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          customers.find((customer) => customer.id === id) ?? null,
      },
      contact: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          contacts.find((contact) => contact.id === id) ?? null,
        findFirst: async ({
          where: { phone },
          include,
        }: {
          where: { phone: string };
          include?: Record<string, unknown>;
        }) => {
          const contact = contacts.find((item) => item.phone === phone);

          if (!contact) {
            return null;
          }

          const result = {
            ...contact,
          };

          if (include?.customer) {
            return {
              ...result,
              customer: customers.find((customer) => customer.id === contact.customerId) ?? null,
            };
          }

          return result;
        },
        findMany: async ({ include }: { include?: Record<string, unknown> } = {}) =>
          contacts.map((contact) => {
            const result = { ...contact };

            if (include?.customer) {
              return {
                ...result,
                customer: customers.find((customer) => customer.id === contact.customerId) ?? null,
              };
            }

            return result;
          }),
      },
      whatsAppConversation: {
        findMany: async ({ include }: { include?: Record<string, unknown> } = {}) =>
          conversations.map((conversation) => buildConversation(conversation, include)),
        findUnique: async ({
          where: { id },
          include,
        }: {
          where: { id: string };
          include?: Record<string, unknown>;
        }) => {
          const conversation = conversations.find((item) => item.id === id);
          return conversation ? buildConversation(conversation, include) : null;
        },
        update: async ({
          where: { id },
          data,
          include,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
          include?: Record<string, unknown>;
        }) => {
          const index = conversations.findIndex((item) => item.id === id);
          if (index === -1) {
            return null;
          }
          conversations[index] = {
            ...conversations[index],
            ...data,
            updatedAt: new Date("2026-05-22T11:00:00.000Z"),
          };
          return buildConversation(conversations[index], include);
        },
        upsert: async ({
          where: {
            accountId_waId: { accountId, waId },
          },
          update,
          create,
        }: {
          where: { accountId_waId: { accountId: string; waId: string } };
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) => {
          const index = conversations.findIndex(
            (item) => item.accountId === accountId && item.waId === waId,
          );

          if (index !== -1) {
            conversations[index] = {
              ...conversations[index],
              ...update,
              updatedAt: new Date("2026-05-22T11:10:00.000Z"),
            };
            return conversations[index];
          }

          const conversation = {
            id: `conversation-${conversations.length + 1}`,
            createdAt: new Date("2026-05-22T11:10:00.000Z"),
            updatedAt: new Date("2026-05-22T11:10:00.000Z"),
            ...create,
          };
          conversations.push(conversation as (typeof conversations)[number]);
          return conversation;
        },
      },
      whatsAppAccount: {
        upsert: async ({
          where: { phoneNumberId },
          update,
          create,
        }: {
          where: { phoneNumberId: string };
          update: Record<string, unknown>;
          create: Record<string, unknown>;
        }) => {
          const index = accounts.findIndex((account) => account.phoneNumberId === phoneNumberId);

          if (index !== -1) {
            accounts[index] = { ...accounts[index], ...update };
            return accounts[index];
          }

          const account = {
            id: `kapso-account-${accounts.length + 1}`,
            createdAt: new Date("2026-05-22T11:10:00.000Z"),
            updatedAt: new Date("2026-05-22T11:10:00.000Z"),
            active: true,
            ...create,
          };
          accounts.push(account);
          return account;
        },
      },
      whatsAppMessage: {
        findMany: async ({ where }: { where?: { conversationId?: string } } = {}) =>
          where?.conversationId
            ? messages.filter((message) => message.conversationId === where.conversationId)
            : messages,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const message = {
            id: `message-${messages.length + 1}`,
            createdAt: new Date("2026-05-22T11:10:00.000Z"),
            ...data,
          };
          messages.push(message as (typeof messages)[number]);
          return message;
        },
        update: async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const index = messages.findIndex((message) => message.id === id);
          if (index === -1) {
            return null;
          }
          messages[index] = {
            ...messages[index],
            ...data,
          };
          return messages[index];
        },
      },
      whatsAppInternalNote: {
        create: async ({
          data,
        }: {
          data: { conversationId: string; authorUserId: string; body: string };
        }) => {
          const note = {
            id: `note-${notes.length + 1}`,
            createdAt: new Date("2026-05-22T11:05:00.000Z"),
            ...data,
          };
          notes.push(note);
          return note;
        },
        findMany: async ({ where }: { where?: { conversationId?: string } } = {}) =>
          where?.conversationId
            ? notes.filter((note) => note.conversationId === where.conversationId)
            : notes,
      },
      whatsAppConversationTag: {
        findMany: async ({ where }: { where?: { conversationId?: string } } = {}) =>
          where?.conversationId
            ? tags.filter((tag) => tag.conversationId === where.conversationId)
            : tags,
      },
      noraActionLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const action = {
            id: `nora-action-${noraActions.length + 1}`,
            createdAt: new Date("2026-05-22T11:15:00.000Z"),
            updatedAt: new Date("2026-05-22T11:15:00.000Z"),
            ...data,
          };
          noraActions.push(action as (typeof noraActions)[number]);
          return action;
        },
        update: async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const index = noraActions.findIndex((action) => action.id === id);
          if (index === -1) {
            return null;
          }
          noraActions[index] = {
            ...noraActions[index],
            ...data,
            updatedAt: new Date("2026-05-22T11:16:00.000Z"),
          };
          return noraActions[index];
        },
        findMany: async ({ where }: { where?: { conversationId?: string } } = {}) =>
          where?.conversationId
            ? noraActions.filter((action) => action.conversationId === where.conversationId)
            : noraActions,
      },
      product: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          id === "product-1"
            ? {
                id,
                name: "Fertilizante",
                sku: "FERT-001",
                unit: "kg",
                presentation: "Bulto 50kg",
                basePrice: 50000,
              }
            : null,
      },
      opportunity: {
        findUnique: async () => null,
      },
      quote: {
        findUnique: async () => null,
      },
      order: {
        count: async () => orders.length,
        create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
          const order = {
            id: `order-${orders.length + 1}`,
            status: "recibido",
            createdAt: new Date("2026-05-22T11:20:00.000Z"),
            updatedAt: new Date("2026-05-22T11:20:00.000Z"),
            ...data,
            items: include?.items ? (data.items as { create: unknown[] }).create : undefined,
            customer: include?.customer
              ? customers.find((customer) => customer.id === data.customerId) ?? null
              : undefined,
            opportunity: null,
            sourceQuote: null,
            sourceConversation: include?.sourceConversation
              ? conversations.find(
                  (conversation) => conversation.id === data.sourceConversationId,
                ) ?? null
              : undefined,
          };
          orders.push(order as (typeof orders)[number]);
          return order;
        },
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          orders.find((order) => order.id === id) ?? null,
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const auditLog = {
            id: `audit-${auditLogs.length + 1}`,
            createdAt: new Date("2026-05-22T11:20:00.000Z"),
            ...data,
          };
          auditLogs.push(auditLog);
          return auditLog;
        },
      },
      $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(prismaStub),
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (app) {
      await app.close();
    }
  });

  it("lists conversations", async () => {
    const response = await request(app.getHttpServer())
      .get("/whatsapp/conversations")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("conversation-1");
    expect(response.body[0].tags).toHaveLength(1);
  });

  it("gets a conversation with inbox details", async () => {
    const response = await request(app.getHttpServer())
      .get("/whatsapp/conversations/conversation-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.customer.id).toBe("customer-1");
    expect(response.body.contact.id).toBe("contact-1");
    expect(response.body.assignedToUser.id).toBe("sales-user-id");
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.notes).toHaveLength(1);
    expect(response.body.tags).toHaveLength(1);
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0].items).toHaveLength(1);
    expect(response.body.orders[0].customer.id).toBe("customer-1");
    expect(response.body.noraActions).toHaveLength(1);
  });

  it("patches conversation status", async () => {
    const response = await request(app.getHttpServer())
      .patch("/whatsapp/conversations/conversation-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "pendiente" })
      .expect(200);

    expect(response.body.status).toBe("pendiente");
  });

  it("clears nullable relationship fields", async () => {
    const response = await request(app.getHttpServer())
      .patch("/whatsapp/conversations/conversation-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ assignedToUserId: null, contactId: null })
      .expect(200);

    expect(response.body.assignedToUserId).toBeNull();
    expect(response.body.contactId).toBeNull();
    expect(response.body.assignedToUser).toBeNull();
    expect(response.body.contact).toBeNull();
  });

  it("rejects a contact that does not belong to the effective customer", async () => {
    const response = await request(app.getHttpServer())
      .patch("/whatsapp/conversations/conversation-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ customerId: "customer-1", contactId: "contact-2" })
      .expect(400);

    expect(response.body.message).toBe("Contact does not belong to customer");
  });

  it("creates an internal note with the authenticated user", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/conversations/conversation-1/notes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "Revisar cantidades" })
      .expect(201);

    expect(response.body.body).toBe("Revisar cantidades");
    expect(response.body.authorUserId).toBe("admin-user-id");
    expect(response.body.conversationId).toBe("conversation-1");
  });

  it("sends an outbound WhatsApp message with the authenticated user", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/conversations/conversation-1/messages")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "Recibido. Vamos a revisar tu pedido." })
      .expect(201);

    expect(response.body.body).toBe("Recibido. Vamos a revisar tu pedido.");
    expect(response.body.conversationId).toBe("conversation-1");
    expect(response.body.direction).toBe(WhatsAppMessageDirection.outbound);
    expect(response.body.role).toBe(WhatsAppMessageRole.assistant);
    expect(response.body.authorUserId).toBe("admin-user-id");
    expect(response.body.deliveryStatus).toBe("sent");
    expect(response.body.payload).toMatchObject({
      provider: "kapso",
      providerResult: expect.any(Object),
    });

    expect(messages).toContainEqual(
      expect.objectContaining({
        conversationId: "conversation-1",
        direction: WhatsAppMessageDirection.outbound,
        role: WhatsAppMessageRole.assistant,
        authorUserId: "admin-user-id",
        body: "Recibido. Vamos a revisar tu pedido.",
        deliveryStatus: "sent",
        payload: expect.objectContaining({
          provider: "kapso",
          providerResult: expect.any(Object),
        }),
      }),
    );
    expect(conversations).toContainEqual(
      expect.objectContaining({
        id: "conversation-1",
        lastMessageText: "Recibido. Vamos a revisar tu pedido.",
        lastMessageAt: expect.any(Date),
      }),
    );
  });

  it("creates an order draft from a WhatsApp conversation", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/conversations/conversation-1/order-draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerId: "customer-1",
        sourceConversationId: "conversation-ignored",
        requesterName: "Laura Cliente",
        requesterPhone: "+573001112233",
        items: [{ productName: "Fertilizante especial", quantity: 2, unitPrice: 0 }],
      })
      .expect(201);

    expect(response.body.sourceConversationId).toBe("conversation-1");
    expect(response.body.sourceConversation.id).toBe("conversation-1");
    expect(response.body.approvalStatus).toBe("en_revision");
    expect(response.body.requesterName).toBe("Laura Cliente");
  });

  it("returns 404 when creating an order draft for a missing conversation", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/conversations/missing/order-draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerId: "customer-1",
        items: [{ productName: "Fertilizante especial", quantity: 2, unitPrice: 0 }],
      })
      .expect(404);

    expect(response.body.message).toBe("WhatsApp conversation not found");
  });

  it("keeps a failed outbound WhatsApp send attempt in the inbox", async () => {
    process.env.KAPSO_TEST_SEND_FAILURE = "1";

    try {
      const response = await request(app.getHttpServer())
        .post("/whatsapp/conversations/conversation-1/messages")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ body: "Intentaremos de nuevo." })
        .expect(502);

      expect(response.body.message).toBe("Could not send WhatsApp message");
      expect(messages).toContainEqual(
        expect.objectContaining({
          conversationId: "conversation-1",
          direction: WhatsAppMessageDirection.outbound,
          role: WhatsAppMessageRole.assistant,
          authorUserId: "admin-user-id",
          body: "Intentaremos de nuevo.",
          deliveryStatus: "failed",
          payload: expect.objectContaining({
            provider: "kapso",
            error: "Forced Kapso send failure",
          }),
        }),
      );
      expect(conversations).toContainEqual(
        expect.objectContaining({
          id: "conversation-1",
          lastMessageText: "Intentaremos de nuevo.",
          lastMessageAt: expect.any(Date),
        }),
      );
    } finally {
      delete process.env.KAPSO_TEST_SEND_FAILURE;
    }
  });

  it("returns 404 when getting a missing conversation", async () => {
    await request(app.getHttpServer())
      .get("/whatsapp/conversations/missing")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404);
  });

  it("returns 404 when creating a note for a missing conversation", async () => {
    await request(app.getHttpServer())
      .post("/whatsapp/conversations/missing/notes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "Nota" })
      .expect(404);
  });

  it("returns 404 when sending a message for a missing conversation", async () => {
    await request(app.getHttpServer())
      .post("/whatsapp/conversations/missing/messages")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ body: "Mensaje" })
      .expect(404);
  });

  it("receives a Kapso message webhook and persists inbox records", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: {
          phone_number_id: "phone-number-1",
          message: {
            id: "wamid-1",
            from: "573001112233",
            timestamp: "2026-05-22T20:00:00.000Z",
            text: { body: "Necesito 10 bultos de producto A" },
            profile: { name: "Cliente Demo" },
          },
        },
      })
      .expect(201);

    expect(response.body.ignored).toBe(false);
    expect(response.body.conversationId).toBe("conversation-2");
    expect(response.body.messageId).toMatch(/^message-\d+$/);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      phoneNumberId: "phone-number-1",
      phoneNumber: "phone-number-1",
      displayName: "WhatsApp",
    });
    expect(conversations).toContainEqual(
      expect.objectContaining({
        id: "conversation-2",
        accountId: "kapso-account-1",
        waId: "573001112233",
        phone: "573001112233",
        senderName: "Cliente Demo",
        senderType: WhatsAppSenderType.cliente,
        customerId: "customer-1",
        contactId: "contact-1",
        lastMessageText: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        id: response.body.messageId,
        conversationId: "conversation-2",
        kapsoMessageId: "wamid-1",
        metaMessageId: "wamid-1",
        direction: WhatsAppMessageDirection.inbound,
        role: WhatsAppMessageRole.user,
        body: "Necesito 10 bultos de producto A",
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        conversationId: "conversation-2",
        direction: WhatsAppMessageDirection.outbound,
        role: WhatsAppMessageRole.assistant,
        body: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
        deliveryStatus: "sent",
      }),
    );
    expect(noraActions).toContainEqual(
      expect.objectContaining({
        conversationId: "conversation-2",
        mode: "cliente",
        action: "classify_inbound_message",
        status: NoraActionStatus.proposed,
        input: expect.objectContaining({
          body: "Necesito 10 bultos de producto A",
          conversationId: "conversation-2",
          senderType: WhatsAppSenderType.cliente,
          customerId: "customer-1",
          contactId: "contact-1",
        }),
        output: expect.objectContaining({
          mode: "cliente",
          intent: "pedido",
          proposed_order: expect.objectContaining({
            items: [expect.objectContaining({ name: "producto A", quantity: 10 })],
          }),
        }),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/whatsapp/route",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Necesito 10 bultos de producto A"),
      }),
    );
  });

  it("receives a top-level Kapso v2 message webhook", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        phone_number_id: "phone-number-v2",
        message: {
          id: "wamid-v2",
          timestamp: "1730092800",
          type: "text",
          kapso: {
            direction: "inbound",
            status: "received",
            processing_status: "pending",
            origin: "cloud_api",
            has_media: false,
            content: "Hola Nora, necesito alimento para postura",
          },
        },
        conversation: {
          id: "conv-v2",
          phone_number: "+573009998877",
          status: "active",
          phone_number_id: "phone-number-v2",
          kapso: {
            contact_name: "Cliente V2",
            last_message_id: "wamid-v2",
            last_message_text: "Hola Nora, necesito alimento para postura",
          },
        },
        is_new_conversation: true,
      })
      .expect(201);

    expect(response.body.ignored).toBe(false);
    expect(conversations).toContainEqual(
      expect.objectContaining({
        accountId: "kapso-account-2",
        waId: "+573009998877",
        phone: "+573009998877",
        senderName: "Cliente V2",
        lastMessageText: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        id: response.body.messageId,
        kapsoMessageId: "wamid-v2",
        metaMessageId: "wamid-v2",
        direction: WhatsAppMessageDirection.inbound,
        role: WhatsAppMessageRole.user,
        body: "Hola Nora, necesito alimento para postura",
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        conversationId: response.body.conversationId,
        direction: WhatsAppMessageDirection.outbound,
        role: WhatsAppMessageRole.assistant,
        body: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
        deliveryStatus: "sent",
      }),
    );
  });

  it("marks Nora route failures on the action log without rejecting the webhook", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: "Nora unavailable" }),
    });

    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: {
          phone_number_id: "phone-number-1",
          message: {
            id: "wamid-nora-fail",
            from: "573009999999",
            timestamp: "2026-05-22T20:05:00.000Z",
            text: { body: "Hola, quiero informacion" },
          },
        },
      })
      .expect(201);

    expect(response.body.ignored).toBe(false);
    expect(noraActions).toContainEqual(
      expect.objectContaining({
        conversationId: response.body.conversationId,
        mode: "cliente",
        action: "classify_inbound_message",
        status: NoraActionStatus.failed,
        error: "Nora route request failed with status 503",
      }),
    );
  });

  it("ignores non-message Kapso webhook events", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({ type: "whatsapp.message.status", data: { messageId: "wamid-1" } })
      .expect(201);

    expect(response.body).toEqual({ ignored: true });
  });

  it("rejects Kapso message webhooks missing required fields", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: {
          phone_number_id: "phone-number-1",
          message: {
            id: "wamid-missing-from",
            text: { body: "Hola" },
          },
        },
      })
      .expect(400);

    expect(response.body.message).toBe("Kapso message webhook is missing required fields");
  });

  it("rejects Kapso message webhooks missing text body", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: {
          phone_number_id: "phone-number-1",
          message: {
            id: "wamid-missing-body",
            from: "573001112233",
          },
        },
      })
      .expect(400);

    expect(response.body.message).toBe("Kapso message webhook is missing required fields");
  });
});
