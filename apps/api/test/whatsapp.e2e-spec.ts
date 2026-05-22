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
    { id: "contact-1", customerId: "customer-1", fullName: "Laura Cliente" },
    { id: "contact-2", customerId: "customer-2", fullName: "Carlos Cliente" },
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
  const orders = [
    {
      id: "order-1",
      customerId: "customer-1",
      sourceConversationId: "conversation-1",
      orderNumber: "PED-000001",
      items: [{ id: "item-1", orderId: "order-1", productSnapshotName: "Fertilizante" }],
      customer: customers[0],
    },
  ];
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
    expect(response.body.messageId).toBe("message-2");
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
        lastMessageText: "Necesito 10 bultos de producto A",
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        id: "message-2",
        conversationId: "conversation-2",
        kapsoMessageId: "wamid-1",
        metaMessageId: "wamid-1",
        direction: WhatsAppMessageDirection.inbound,
        role: WhatsAppMessageRole.user,
        body: "Necesito 10 bultos de producto A",
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
});
