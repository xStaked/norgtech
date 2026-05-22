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

  const customers = [{ id: "customer-1", displayName: "Agro Norte" }];
  const contacts = [{ id: "contact-1", customerId: "customer-1", fullName: "Laura Cliente" }];
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

  const buildConversation = (conversation: Record<string, unknown>) => ({
    ...conversation,
    customer: customers.find((customer) => customer.id === conversation.customerId) ?? null,
    contact: contacts.find((contact) => contact.id === conversation.contactId) ?? null,
    assignedToUser: users.find((user) => user.id === conversation.assignedToUserId) ?? null,
    tags: tags.filter((tag) => tag.conversationId === conversation.id),
    notes: notes.filter((note) => note.conversationId === conversation.id),
    messages: messages.filter((message) => message.conversationId === conversation.id),
    orders: orders.filter((order) => order.sourceConversationId === conversation.id),
    noraActions: noraActions.filter((action) => action.conversationId === conversation.id),
  });

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
        findMany: async () => conversations.map(buildConversation),
        findUnique: async ({ where: { id } }: { where: { id: string } }) => {
          const conversation = conversations.find((item) => item.id === id);
          return conversation ? buildConversation(conversation) : null;
        },
        update: async ({
          where: { id },
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
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
          return buildConversation(conversations[index]);
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
});
