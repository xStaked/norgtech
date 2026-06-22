import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  NoraActionStatus,
  NoraCaseRiskLevel,
  NoraConversationCase,
  NoraConversationCaseStatus,
  NoraConversationCaseType,
  UserRole,
  WhatsAppConversationStatus,
  WhatsAppMessageDirection,
  WhatsAppMessageRole,
  WhatsAppSenderType,
} from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { NoraCaseService } from "../src/modules/whatsapp/nora-case.service";
import { PrismaService } from "../src/prisma/prisma.service";

describe("WhatsApp inbox", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  let adminToken: string;
  let noraCaseService: NoraCaseService;
  let originalFetch: typeof globalThis.fetch;
  let originalNoraAutomationUserId: string | undefined;

  const users = [
    {
      id: "admin-user-id",
      name: "Admin",
      email: "admin@norgtech.local",
      phone: "+573001000001",
      passwordHash,
      role: UserRole.administrador,
      active: true,
    },
    {
      id: "sales-user-id",
      name: "Sales",
      email: "sales@norgtech.local",
      phone: "+573004445566",
      passwordHash,
      role: UserRole.comercial,
      active: true,
    },
  ];

  const customers = [
    { id: "customer-1", displayName: "Agro Norte", legalName: "Agro Norte SAS" },
    { id: "customer-2", displayName: "Agro Sur", legalName: "Agro Sur SAS" },
  ];
  const companies = [
    { id: "company-1", name: "Norgtech", prefix: "NOR", isActive: true },
    { id: "company-3", name: "Archivada", prefix: "ARC", isActive: false },
    { id: "company-2", name: "Zentrade", prefix: "ZEN", isActive: true },
  ];
  const zones = [
    { id: "zone-1", name: "Costa" },
    { id: "zone-2", name: "Interior" },
  ];
  const customerZones = [
    {
      id: "customer-zone-1",
      customerId: "customer-1",
      zoneId: "zone-1",
      isActive: true,
    },
    {
      id: "customer-zone-inactive",
      customerId: "customer-1",
      zoneId: "zone-2",
      isActive: false,
    },
    {
      id: "customer-zone-2",
      customerId: "customer-2",
      zoneId: "zone-2",
      isActive: true,
    },
  ];
  const products = [
    {
      id: "product-1",
      name: "Fertilizante",
      sku: "FERT-001",
      unit: "kg",
      presentation: "Bulto 50kg",
      basePrice: 50000,
      active: true,
    },
    {
      id: "product-2",
      name: "Fertilizante Plus",
      sku: "FERT-PLUS",
      unit: "kg",
      presentation: "Bulto 50kg",
      basePrice: 65000,
      active: true,
    },
    {
      id: "product-3",
      name: "Solar Mix",
      sku: "SOL",
      unit: "kg",
      presentation: "Bulto 25kg",
      basePrice: 42000,
      active: true,
    },
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
  const findLatestOrderByNumber = ({
    where,
  }: {
    where?: { orderNumber?: { startsWith?: string } };
  } = {}) => {
    const startsWith = where?.orderNumber?.startsWith;

    return (
      orders
        .filter((order) => typeof order.orderNumber === "string")
        .filter(
          (order) =>
            !startsWith || String(order.orderNumber).startsWith(startsWith),
        )
        .sort((left, right) =>
          String(right.orderNumber).localeCompare(String(left.orderNumber)),
        )[0] ?? null
    );
  };
  const auditLogs: Array<Record<string, unknown>> = [];
  const noraActions: Array<Record<string, unknown>> = [
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
  const noraCases: Array<Record<string, unknown>> = [
    {
      id: "case-order-1",
      conversationId: "conversation-1",
      parentCaseId: null,
      type: "order",
      status: "collecting_info",
      extractedData: {
        customerRef: "Agro Costa",
        companyRef: "Nanonutricion",
        zoneRef: "Costa",
        items: [{ productRef: "Fertilizante", quantity: 5, presentation: "bultos" }],
        deliveryInstructions: "Despachar esta semana",
      },
      missingFields: ["customerId"],
      attachments: [],
      proposal: null,
      lastQuestion: "Necesito identificar el cliente antes de continuar.",
      riskLevel: "high",
      createdByUserId: "sales-user-id",
      approvedByUserId: null,
      executedEntityType: null,
      executedEntityId: null,
      createdAt: new Date("2026-06-21T16:10:00.000Z"),
      updatedAt: new Date("2026-06-21T16:10:00.000Z"),
    },
  ];
  const accounts: Array<Record<string, unknown>> = [];
  const openCaseStatuses = ["collecting_info", "ready_for_review", "blocked"];
  const caseLockQueues = new Map<string, Promise<void>>();
  const caseLockCalls: string[] = [];

  const acquireCaseLock = async (caseId: string) => {
    let releaseCurrentLock: () => void = () => undefined;
    const previousLock = caseLockQueues.get(caseId) ?? Promise.resolve();
    const currentLock = previousLock.then(
      () =>
        new Promise<void>((resolve) => {
          releaseCurrentLock = resolve;
        }),
    );
    caseLockQueues.set(caseId, currentLock);
    await previousLock;

    return () => {
      releaseCurrentLock();
      if (caseLockQueues.get(caseId) === currentLock) {
        caseLockQueues.delete(caseId);
      }
    };
  };

  const prismaNoraConversationCase = {
    findFirst: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const id = where?.id;
      const conversationId = where?.conversationId;
      const parentCaseId = where?.parentCaseId;
      const type = where?.type;
      const status = where?.status as { in?: string[] } | undefined;
      const allowedStatuses = status?.in;
      return (
        noraCases
          .filter((item) => !id || item.id === id)
          .filter((item) => !conversationId || item.conversationId === conversationId)
          .filter((item) => parentCaseId === undefined || item.parentCaseId === parentCaseId)
          .filter((item) => !type || item.type === type)
          .filter((item) => !allowedStatuses || allowedStatuses.includes(String(item.status)))
          .sort((left, right) => {
            const leftDate = left.updatedAt as Date;
            const rightDate = right.updatedAt as Date;
            return rightDate.getTime() - leftDate.getTime();
          })[0] ?? null
      );
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const item = {
        id: `case-${noraCases.length + 1}`,
        status: "collecting_info",
        extractedData: {},
        missingFields: [],
        attachments: [],
        riskLevel: "medium",
        createdAt: new Date("2026-06-21T16:11:00.000Z"),
        updatedAt: new Date("2026-06-21T16:11:00.000Z"),
        ...data,
      };
      noraCases.unshift(item);
      return item;
    }),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const index = noraCases.findIndex((item) => item.id === where.id);
        if (index === -1) return null;
        noraCases[index] = {
          ...noraCases[index],
          ...data,
          updatedAt: new Date("2026-06-21T16:12:00.000Z"),
        };
        return noraCases[index];
      },
    ),
  };

  const applySelect = (
    record: Record<string, unknown>,
    select?: Record<string, unknown>,
  ) => {
    if (!select) {
      return record;
    }

    return Object.fromEntries(
      Object.entries(select)
        .filter(([, enabled]) => enabled === true)
        .map(([key]) => [key, record[key]]),
    );
  };

  const buildConversation = (
    conversation: Record<string, unknown>,
    include?: Record<string, unknown>,
    select?: Record<string, unknown>,
  ) => {
    const result = select
      ? applySelect(conversation, select)
      : ({ ...conversation } as Record<string, unknown>);
    const customerArg = include?.customer ?? select?.customer;
    const contactArg = include?.contact ?? select?.contact;
    const messagesArg = include?.messages ?? select?.messages;

    if (customerArg) {
      const customer =
        customers.find((item) => item.id === conversation.customerId) ?? null;

      if (
        customer &&
        typeof customerArg === "object" &&
        ("include" in customerArg || "select" in customerArg)
      ) {
        const customerSelection =
          "include" in customerArg ? customerArg.include : customerArg.select;
        const selectedCustomer = applySelect(
          customer,
          "select" in customerArg ? (customerArg.select as Record<string, unknown>) : undefined,
        );

        result.customer = {
          ...selectedCustomer,
        };

        if (
          customerSelection &&
          typeof customerSelection === "object" &&
          "customerZones" in customerSelection
        ) {
          result.customer = {
            ...(result.customer as Record<string, unknown>),
            customerZones: customerZones
              .filter(
                (customerZone) =>
                  customerZone.customerId === customer.id && customerZone.isActive,
              )
              .map((customerZone) => {
                const zone = zones.find((item) => item.id === customerZone.zoneId) ?? null;
                return {
                  id: customerZone.id,
                  zone: zone ? { name: zone.name } : null,
                };
              }),
          };
        }
      } else {
        result.customer = customer;
      }
    }
    if (contactArg) {
      const contact = contacts.find((item) => item.id === conversation.contactId) ?? null;
      result.contact =
        contact && typeof contactArg === "object" && "select" in contactArg
          ? applySelect(contact, contactArg.select as Record<string, unknown>)
          : contact;
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
    if (messagesArg) {
      const messageOptions =
        typeof messagesArg === "object" ? (messagesArg as Record<string, unknown>) : {};
      let conversationMessages = messages.filter(
        (message) => message.conversationId === conversation.id,
      );

      if (
        messageOptions.orderBy &&
        typeof messageOptions.orderBy === "object" &&
        "createdAt" in messageOptions.orderBy
      ) {
        const direction = (messageOptions.orderBy as { createdAt?: string }).createdAt;
        conversationMessages = conversationMessages
          .slice()
          .sort((left, right) =>
            direction === "desc"
              ? right.createdAt.getTime() - left.createdAt.getTime()
              : left.createdAt.getTime() - right.createdAt.getTime(),
          );
      }

      if (typeof messageOptions.take === "number") {
        conversationMessages = conversationMessages.slice(0, messageOptions.take);
      }

      result.messages = conversationMessages.map((message) =>
        messageOptions.select
          ? applySelect(message, messageOptions.select as Record<string, unknown>)
          : message,
      );
    }
    if (include?.orders) {
      result.orders = orders.filter((order) => order.sourceConversationId === conversation.id);
    }
    if (include?.noraActions) {
      result.noraActions = noraActions.filter(
        (action) => action.conversationId === conversation.id,
      );
    }
    if (include?.noraCases) {
      result.noraCases = noraCases
        .filter((item) => item.conversationId === conversation.id)
        .sort((left, right) => {
          const leftDate = left.updatedAt as Date;
          const rightDate = right.updatedAt as Date;
          return rightDate.getTime() - leftDate.getTime();
        });
    }

    return result;
  };

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    originalNoraAutomationUserId = process.env.NORA_AUTOMATION_USER_ID;
    process.env.NORA_AUTOMATION_USER_ID = "admin-user-id";
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        mode: "cliente",
        intent: "pedido",
        summary: "Cliente solicita 10 bultos de producto A para la costa.",
        suggested_reply: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
        requires_human_review: true,
        risk_level: "high",
        missing_fields: [],
        proposals: [
          {
            type: "order_draft",
            title: "Borrador de pedido",
            payload: {
              customerId: "customer-1",
              companyId: "company-1",
              customerZoneId: "zone-1",
              sourceConversationId: "conversation-2",
              items: [],
            },
            requires_human_review: true,
          },
        ],
        proposed_order: { items: [{ name: "producto A", quantity: 10 }] },
      }),
    })) as unknown as typeof globalThis.fetch;

    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
          users.find((user) => user.email === where.email || user.id === where.id) ?? null,
        findMany: async ({
          where,
          select,
        }: {
          where?: { active?: boolean; phone?: { not?: null } };
          select?: Record<string, unknown>;
        } = {}) =>
          users.filter((user) => {
            if (typeof where?.active === "boolean" && user.active !== where.active) {
              return false;
            }
            if (where?.phone?.not === null && user.phone === null) {
              return false;
            }
            return true;
          }).map((user) => (select ? applySelect(user, select) : user)),
      },
      customer: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          customers.find((customer) => customer.id === id) ?? null,
      },
      company: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          companies.find((company) => company.id === id) ?? null,
        findMany: async ({
          where,
          orderBy,
          select,
        }: {
          where?: { isActive?: boolean };
          orderBy?: { name?: "asc" | "desc" };
          select?: Record<string, unknown>;
        } = {}) => {
          let result = companies.slice();

          if (typeof where?.isActive === "boolean") {
            result = result.filter((company) => company.isActive === where.isActive);
          }

          if (orderBy?.name) {
            result = result.sort((left, right) =>
              orderBy.name === "desc"
                ? right.name.localeCompare(left.name)
                : left.name.localeCompare(right.name),
            );
          }

          return result.map((company) => applySelect(company, select));
        },
      },
      customerZone: {
        findMany: async ({
          where,
        }: {
          where?: { customerId?: string; isActive?: boolean };
        } = {}) =>
          customerZones
            .filter(
              (customerZone) =>
                !where?.customerId || customerZone.customerId === where.customerId,
            )
            .filter(
              (customerZone) =>
                where?.isActive === undefined || customerZone.isActive === where.isActive,
            )
            .map((customerZone) => ({
              ...customerZone,
              zone: zones.find((zone) => zone.id === customerZone.zoneId) ?? null,
            })),
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          customerZones.find((customerZone) => customerZone.id === id) ?? null,
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
          select,
        }: {
          where: { id: string };
          include?: Record<string, unknown>;
          select?: Record<string, unknown>;
        }) => {
          const conversation = conversations.find((item) => item.id === id);
          return conversation ? buildConversation(conversation, include, select) : null;
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
            senderType: WhatsAppSenderType.desconocido,
            customerId: null,
            contactId: null,
            createdAt: new Date("2026-05-22T11:10:00.000Z"),
            updatedAt: new Date("2026-05-22T11:10:00.000Z"),
            ...create,
          };
          conversations.push(conversation as unknown as (typeof conversations)[number]);
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
      noraConversationCase: prismaNoraConversationCase,
      product: {
        findMany: async () => products,
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          products.find((product) => product.id === id) ?? null,
      },
      opportunity: {
        findUnique: async () => null,
      },
      quote: {
        findUnique: async () => null,
      },
      order: {
        count: async () => orders.length,
        findFirst: async ({
          where,
        }: {
          where?: {
            orderNumber?: { startsWith?: string };
            sourceConversationId?: string;
          };
        } = {}) => {
          if (where?.sourceConversationId) {
            return (
              orders
                .filter((order) => order.sourceConversationId === where.sourceConversationId)
                .sort((left, right) =>
                  String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")),
                )[0] ?? null
            );
          }

          return findLatestOrderByNumber({ where });
        },
        create: async () => {
          throw new Error("order.create must run inside a transaction");
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
      $queryRaw: jest.fn(async () => [{ id: "locked-case" }]),
      $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
        const lockReleases: Array<() => void> = [];
        const tx = {
          ...prismaStub,
          $queryRaw: jest.fn(async (_strings: TemplateStringsArray, caseId: string) => {
            caseLockCalls.push(caseId);
            const releaseLock = await acquireCaseLock(caseId);
            lockReleases.push(releaseLock);
            return noraCases.some((item) => item.id === caseId) ? [{ id: caseId }] : [];
          }),
          order: {
            ...prismaStub.order,
            create: async ({
              data,
            }: {
              data: Record<string, unknown>;
            }) => {
              const orderId = `order-${orders.length + 1}`;
              const order = {
                id: orderId,
                status: "recibido",
                createdAt: new Date("2026-05-22T11:20:00.000Z"),
                updatedAt: new Date("2026-05-22T11:20:00.000Z"),
                ...data,
                items: (data.items as { create: Record<string, unknown>[] }).create.map(
                  (item, index) => ({
                    id: `order-item-${orders.length + 1}-${index + 1}`,
                    orderId,
                    ...item,
                  }),
                ),
                customer:
                  customers.find((customer) => customer.id === data.customerId) ?? null,
                company: companies.find((company) => company.id === data.companyId) ?? null,
                opportunity: null,
                sourceQuote: null,
                sourceConversation:
                  conversations.find(
                    (conversation) => conversation.id === data.sourceConversationId,
                  ) ?? null,
              };
              orders.push(order as (typeof orders)[number]);
              return order;
            },
            findFirst: findLatestOrderByNumber,
          },
        };

        try {
          return await callback(tx);
        } finally {
          for (const releaseLock of lockReleases.reverse()) {
            releaseLock();
          }
        }
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
    noraCaseService = moduleRef.get(NoraCaseService);

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@norgtech.local", password: "Admin123*" })
      .expect(200);

    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (originalNoraAutomationUserId === undefined) {
      delete process.env.NORA_AUTOMATION_USER_ID;
    } else {
      process.env.NORA_AUTOMATION_USER_ID = originalNoraAutomationUserId;
    }
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

  it("includes Nora active cases in conversation detail", async () => {
    const response = await request(app.getHttpServer())
      .get("/whatsapp/conversations/conversation-1")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.noraCases).toEqual([
      expect.objectContaining({
        id: "case-order-1",
        type: "order",
        status: "collecting_info",
        missingFields: ["customerId"],
        lastQuestion: "Necesito identificar el cliente antes de continuar.",
      }),
    ]);
  });

  it("serializes overlapping new-customer subcase creation for the same order case", async () => {
    const createdIds: string[] = [];
    caseLockCalls.length = 0;

    try {
      const orderCase = noraCases.find((item) => item.id === "case-order-1");
      expect(orderCase).toBeDefined();

      const [first, second] = await Promise.all([
        noraCaseService.createNewCustomerSubcase(
          orderCase as NoraConversationCase,
          "sales-user-id",
        ),
        noraCaseService.createNewCustomerSubcase(
          orderCase as NoraConversationCase,
          "sales-user-id",
        ),
      ]);
      createdIds.push(String(first.id), String(second.id));

      expect(second.id).toBe(first.id);
      const openNewCustomerChildren = noraCases.filter(
        (item) =>
          item.parentCaseId === "case-order-1" &&
          item.type === NoraConversationCaseType.new_customer &&
          openCaseStatuses.includes(String(item.status)),
      );
      expect(openNewCustomerChildren).toHaveLength(1);
      expect(first).toEqual(
        expect.objectContaining({
          status: NoraConversationCaseStatus.collecting_info,
          riskLevel: NoraCaseRiskLevel.high,
          missingFields: expect.arrayContaining(["displayName", "contactName"]),
        }),
      );
      expect(caseLockCalls.filter((caseId) => caseId === "case-order-1")).toHaveLength(2);
    } finally {
      for (const createdId of createdIds) {
        const index = noraCases.findIndex((item) => item.id === createdId);
        if (index !== -1) {
          noraCases.splice(index, 1);
        }
      }
    }
  });

  it("serializes overlapping Nora case extractedData updates without dropping either change", async () => {
    const index = noraCases.findIndex((item) => item.id === "case-order-1");
    const original = { ...noraCases[index] };
    caseLockCalls.length = 0;

    try {
      await Promise.all([
        noraCaseService.updateCase("case-order-1", {
          extractedData: { billingCompanyRef: "NOR" },
        }),
        noraCaseService.updateCase("case-order-1", {
          extractedData: { requestedBy: "Sergio" },
        }),
      ]);

      const updated = noraCases[index];

      expect(updated.extractedData).toEqual(
        expect.objectContaining({
          customerRef: "Agro Costa",
          billingCompanyRef: "NOR",
          requestedBy: "Sergio",
        }),
      );
      expect(caseLockCalls.filter((caseId) => caseId === "case-order-1")).toHaveLength(2);
    } finally {
      noraCases[index] = original;
    }
  });

  it("serializes overlapping Nora case attachment appends without dropping either file", async () => {
    const index = noraCases.findIndex((item) => item.id === "case-order-1");
    const original = { ...noraCases[index] };
    caseLockCalls.length = 0;

    try {
      await Promise.all([
        noraCaseService.updateCase("case-order-1", {
          attachments: [
            {
              messageId: "message-attachment-1",
              kind: "image",
              provider: "kapso",
              providerMediaId: "image-attachment-1",
            },
          ],
        }),
        noraCaseService.updateCase("case-order-1", {
          attachments: [
            {
              messageId: "message-attachment-2",
              kind: "document",
              provider: "kapso",
              providerMediaId: "document-attachment-2",
            },
          ],
        }),
      ]);

      const updated = noraCases[index];

      expect(updated.attachments).toEqual([
        expect.objectContaining({
          messageId: "message-attachment-1",
          providerMediaId: "image-attachment-1",
        }),
        expect.objectContaining({
          messageId: "message-attachment-2",
          providerMediaId: "document-attachment-2",
        }),
      ]);
      expect(caseLockCalls.filter((caseId) => caseId === "case-order-1")).toHaveLength(2);
    } finally {
      noraCases[index] = original;
    }
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

  it("creates an order automatically from a clear WhatsApp order candidate", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/conversations/conversation-1/order-automation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        companyRef: "NOR",
        zoneRef: "Costa",
        items: [{ productRef: "FERT-001", quantity: 10, presentation: "bultos" }],
        notes: "Necesito 10 bultos de FERT-001 por NOR para Costa",
      })
      .expect(201);

    expect(response.body.decision).toBe("created");
    expect(response.body.order.customerId).toBe("customer-1");
    expect(response.body.order.companyId).toBe("company-1");
    expect(response.body.order.customerZoneId).toBe("customer-zone-1");
    expect(response.body.summary.items).toEqual([
      { name: "Fertilizante", sku: "FERT-001", quantity: 10, unit: "kg" },
    ]);
    expect(response.body.reply).toContain("Recibimos tu pedido");
    expect(response.body.reply).toContain("Fertilizante");
  });

  it("does not auto-create when a short SKU appears inside an unrelated product ref", async () => {
    const orderCountBefore = orders.length;

    const response = await request(app.getHttpServer())
      .post("/whatsapp/conversations/conversation-1/order-automation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        companyRef: "NOR",
        zoneRef: "Costa",
        items: [{ productRef: "consola industrial", quantity: 1 }],
        notes: "Necesito 1 consola industrial por NOR para Costa",
      })
      .expect(201);

    expect(["needs_clarification", "human_review"]).toContain(response.body.decision);
    expect(response.body.decision).not.toBe("created");
    expect(orders).toHaveLength(orderCountBefore);
  });

  it("creates an order draft from a WhatsApp conversation", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/conversations/conversation-1/order-draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
        sourceConversationId: "conversation-ignored",
        billingCompanyNameSnapshot: "Facturadora WhatsApp SAS",
        branchNameSnapshot: "Sucursal WhatsApp",
        requesterName: "Laura Cliente",
        requesterPhone: "+573001112233",
        items: [{ productName: "Fertilizante especial", quantity: 2, unitPrice: 0 }],
      })
      .expect(201);

    expect(response.body.sourceConversationId).toBe("conversation-1");
    expect(response.body.sourceConversation.id).toBe("conversation-1");
    expect(response.body.approvalStatus).toBe("en_revision");
    expect(response.body.billingCompanyNameSnapshot).toBe("Facturadora WhatsApp SAS");
    expect(response.body.branchNameSnapshot).toBe("Sucursal WhatsApp");
    expect(response.body.requesterName).toBe("Laura Cliente");
  });

  it("returns 404 when creating an order draft for a missing conversation", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/conversations/missing/order-draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        customerId: "customer-1",
        companyId: "company-1",
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
        lastMessageText: "Necesito 10 bultos de producto A",
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
    expect(
      messages.some(
        (message) =>
          message.conversationId === "conversation-2" &&
          String(message.direction) === WhatsAppMessageDirection.outbound,
      ),
    ).toBe(false);
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
          risk_level: "high",
          proposals: [
            expect.objectContaining({
              type: "order_draft",
              payload: expect.objectContaining({
                sourceConversationId: expect.any(String),
              }),
            }),
          ],
          proposed_order: expect.objectContaining({
            items: [expect.objectContaining({ name: "producto A", quantity: 10 })],
          }),
        }),
      }),
    );
    const noraRouteCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url]) => url === "http://localhost:8000/whatsapp/route",
    );

    expect(noraRouteCall).toBeDefined();
    expect(noraRouteCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
      }),
    );

    const noraRouteBody = JSON.parse(String(noraRouteCall?.[1]?.body ?? "{}"));

    expect(noraRouteBody).toMatchObject({
      sender_type: "cliente",
      conversation_id: "conversation-2",
      customer: {
        id: "customer-1",
        displayName: "Agro Norte",
        legalName: "Agro Norte SAS",
      },
      contact: {
        id: "contact-1",
        fullName: "Laura Cliente",
      },
    });
    expect(noraRouteBody.message).toBe("Necesito 10 bultos de producto A");
    expect(noraRouteBody.companies).toEqual([
      { id: "company-1", name: "Norgtech", prefix: "NOR" },
      { id: "company-2", name: "Zentrade", prefix: "ZEN" },
    ]);
    expect(noraRouteBody.customer_zones).toEqual([
      { id: "customer-zone-1", name: "Costa" },
    ]);
    expect(noraRouteBody.recent_messages).toEqual([
      {
        role: WhatsAppMessageRole.user,
        body: "Necesito 10 bultos de producto A",
      },
    ]);

    const action = noraActions.find((item) => item.conversationId === "conversation-2");
    expect(action?.status).toBe(NoraActionStatus.proposed);
    expect(action?.output).toMatchObject({
      intent: "pedido",
      risk_level: "high",
      proposals: [
        expect.objectContaining({
          type: "order_draft",
          payload: expect.objectContaining({
            sourceConversationId: expect.any(String),
          }),
        }),
      ],
    });
  });

  it("webhook creates a clear order candidate and sends summary reply", async () => {
    const orderCountBefore = orders.length;

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "cliente",
        intent: "pedido",
        summary: "Cliente solicita 10 bultos de FERT-001 por NOR para Costa.",
        suggested_reply: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
        requires_human_review: true,
        risk_level: "high",
        missing_fields: [],
        proposals: [],
        order_candidate: {
          customerId: "customer-1",
          companyRef: "NOR",
          zoneRef: "Costa",
          items: [{ productRef: "FERT-001", quantity: 10, presentation: "bultos" }],
          notes: "Necesito 10 bultos de FERT-001 por NOR para Costa",
          sourceConversationId: "conversation-2",
        },
      }),
    });

    await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: [
          {
            phone_number_id: "phone-number-1",
            message: {
              id: "msg-auto-order",
              from: "573001112233",
              text: { body: "Necesito 10 bultos de FERT-001 por NOR para Costa" },
              profile: { name: "Laura Cliente" },
            },
          },
        ],
      })
      .expect(201);

    expect(orders).toHaveLength(orderCountBefore + 1);
    expect(orders).toContainEqual(
      expect.objectContaining({
        sourceConversationId: "conversation-2",
        customerId: "customer-1",
        companyId: "company-1",
        customerZoneId: "customer-zone-1",
        items: [
          expect.objectContaining({
            productId: "product-1",
            quantity: 10,
            presentationSnapshot: "bultos",
          }),
        ],
      }),
    );
    expect(
      messages.some(
        (message) =>
          String(message.direction) === WhatsAppMessageDirection.outbound &&
          String(message.body).includes("Recibimos tu pedido"),
      ),
    ).toBe(true);
    expect(noraActions).toContainEqual(
      expect.objectContaining({
        conversationId: "conversation-2",
        status: NoraActionStatus.executed,
        output: expect.objectContaining({
          order_automation: expect.objectContaining({
            decision: "created",
            reply: expect.stringContaining("Recibimos tu pedido"),
          }),
        }),
      }),
    );
  });

  it("does not create duplicate orders when Nora retries the same order candidate", async () => {
    contacts.push({
      id: "contact-idempotent",
      customerId: "customer-1",
      fullName: "Cliente Idempotente",
      phone: "+573009001001",
    });
    const orderCountBefore = orders.length;
    const outboundCountBefore = messages.filter(
      (message) => String(message.direction) === WhatsAppMessageDirection.outbound,
    ).length;
    const noraOrderResponse = {
      ok: true,
      json: async () => ({
        mode: "cliente",
        intent: "pedido",
        summary: "Cliente solicita 10 bultos de FERT-001 por NOR para Costa.",
        suggested_reply: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
        requires_human_review: true,
        risk_level: "high",
        missing_fields: [],
        proposals: [],
        order_candidate: {
          customerId: "customer-1",
          companyRef: "NOR",
          zoneRef: "Costa",
          items: [{ productRef: "FERT-001", quantity: 10, presentation: "bultos" }],
          notes: "Necesito 10 bultos de FERT-001 por NOR para Costa",
          sourceConversationId: "ignored-by-api",
        },
      }),
    };

    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(noraOrderResponse)
      .mockResolvedValueOnce(noraOrderResponse);

    const webhookPayload = {
      type: "whatsapp.message.received",
      data: [
        {
          phone_number_id: "phone-number-1",
          message: {
            id: "msg-auto-order-retry",
            from: "573009001001",
            text: { body: "Necesito 10 bultos de FERT-001 por NOR para Costa" },
            profile: { name: "Cliente Idempotente" },
          },
        },
      ],
    };

    const firstResponse = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send(webhookPayload)
      .expect(201);

    await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send(webhookPayload)
      .expect(201);

    const createdOrders = orders.filter(
      (order) => order.sourceConversationId === firstResponse.body.conversationId,
    );
    const outboundMessages = messages.filter(
      (message) =>
        message.conversationId === firstResponse.body.conversationId &&
        String(message.direction) === WhatsAppMessageDirection.outbound,
    );

    expect(orders).toHaveLength(orderCountBefore + 1);
    expect(createdOrders).toHaveLength(1);
    expect(outboundMessages).toHaveLength(1);
    expect(
      messages.filter((message) => String(message.direction) === WhatsAppMessageDirection.outbound),
    ).toHaveLength(outboundCountBefore + 1);
    expect(noraActions).toContainEqual(
      expect.objectContaining({
        conversationId: firstResponse.body.conversationId,
        output: expect.objectContaining({
          order_automation: expect.objectContaining({
            decision: "human_review",
            reason: expect.stringContaining("ya tiene un pedido"),
          }),
        }),
      }),
    );
  });

  it("does not create an order for invalid Nora candidate quantities", async () => {
    contacts.push({
      id: "contact-invalid-quantity",
      customerId: "customer-1",
      fullName: "Cliente Cantidad Invalida",
      phone: "+573009001002",
    });
    const orderCountBefore = orders.length;

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "cliente",
        intent: "pedido",
        summary: "Cliente envia un pedido sin cantidad valida.",
        suggested_reply: "Recibido. Vamos a validar disponibilidad y datos del pedido.",
        requires_human_review: true,
        risk_level: "high",
        missing_fields: [],
        proposals: [],
        order_candidate: {
          customerId: "customer-1",
          companyRef: "NOR",
          zoneRef: "Costa",
          items: [{ productRef: "FERT-001", quantity: 0, presentation: "bultos" }],
          notes: "Necesito 0 bultos de FERT-001 por NOR para Costa",
          sourceConversationId: "ignored-by-api",
        },
      }),
    });

    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: [
          {
            phone_number_id: "phone-number-1",
            message: {
              id: "msg-invalid-quantity",
              from: "573009001002",
              text: { body: "Necesito 0 bultos de FERT-001 por NOR para Costa" },
              profile: { name: "Cliente Cantidad Invalida" },
            },
          },
        ],
      })
      .expect(201);

    expect(orders).toHaveLength(orderCountBefore);
    expect(noraActions).toContainEqual(
      expect.objectContaining({
        conversationId: response.body.conversationId,
        status: NoraActionStatus.proposed,
        output: expect.objectContaining({
          order_automation: expect.objectContaining({
            decision: "needs_clarification",
            missingField: "items",
          }),
        }),
      }),
    );
  });

  it("auto-sends low-risk Nora replies that do not require human review", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "cliente",
        intent: "saludo",
        summary: "Cliente saluda.",
        suggested_reply: "Hola, recibimos tu mensaje. ¿En qué podemos ayudarte?",
        requires_human_review: false,
        proposed_order: null,
      }),
    });

    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: {
          phone_number_id: "phone-number-1",
          message: {
            id: "wamid-low-risk",
            from: "573009998881",
            timestamp: "2026-05-22T20:01:00.000Z",
            text: { body: "Hola" },
            profile: { name: "Cliente Bajo Riesgo" },
          },
        },
      })
      .expect(201);

    expect(messages).toContainEqual(
      expect.objectContaining({
        conversationId: response.body.conversationId,
        direction: WhatsAppMessageDirection.outbound,
        role: WhatsAppMessageRole.assistant,
        body: "Hola, recibimos tu mensaje. ¿En qué podemos ayudarte?",
        deliveryStatus: "sent",
      }),
    );
  });

  it("routes CRM commercial user phones to Nora with user context", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "comercial",
        intent: "agenda",
        summary: "Comercial consulta agenda.",
        suggested_reply: "Voy a revisar tu agenda y pendientes.",
        requires_human_review: false,
        risk_level: "low",
        missing_fields: [],
        proposals: [],
        proposed_order: null,
      }),
    });

    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: {
          phone_number_id: "phone-number-1",
          message: {
            id: "wamid-sales-user",
            from: "573004445566",
            timestamp: "2026-05-22T20:02:00.000Z",
            text: { body: "Que tengo pendiente hoy?" },
            profile: { name: "Sales" },
          },
        },
      })
      .expect(201);

    expect(conversations).toContainEqual(
      expect.objectContaining({
        id: response.body.conversationId,
        phone: "573004445566",
        senderType: WhatsAppSenderType.comercial,
        customerId: null,
        contactId: null,
      }),
    );
    expect(noraActions).toContainEqual(
      expect.objectContaining({
        conversationId: response.body.conversationId,
        actorUserId: "sales-user-id",
        mode: "comercial",
        input: expect.objectContaining({
          senderType: WhatsAppSenderType.comercial,
          userId: "sales-user-id",
          userRole: UserRole.comercial,
        }),
      }),
    );

    const noraRouteCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url, options]) => {
        if (url !== "http://localhost:8000/whatsapp/route") {
          return false;
        }

        const body = JSON.parse(String(options?.body ?? "{}")) as { message?: string };
        return body.message === "Que tengo pendiente hoy?";
      },
    );

    expect(noraRouteCall).toBeDefined();
    const noraRouteBody = JSON.parse(String(noraRouteCall?.[1]?.body ?? "{}"));

    expect(noraRouteBody).toMatchObject({
      sender_type: "comercial",
      message: "Que tengo pendiente hoy?",
      user: {
        id: "sales-user-id",
        role: UserRole.comercial,
        name: "Sales",
        email: "sales@norgtech.local",
      },
    });
    expect(noraRouteBody.customer).toBeUndefined();
    expect(noraRouteBody.contact).toBeUndefined();
  });

  it("normalizes commercial expense support images and sends recent context to Nora", async () => {
    const expenseConversation = conversations.find(
      (conversation) =>
        conversation.accountId === "kapso-account-1" &&
        conversation.waId === "573004445566",
    );

    expect(expenseConversation).toBeDefined();

    messages.push(
      {
        id: "message-expense-start",
        conversationId: expenseConversation?.id ?? "",
        direction: WhatsAppMessageDirection.inbound,
        role: WhatsAppMessageRole.user,
        body: "registrar gastos",
        createdAt: new Date("2026-05-22T11:08:00.000Z"),
      } as unknown as (typeof messages)[number],
      {
        id: "message-expense-amount-prompt",
        conversationId: expenseConversation?.id ?? "",
        direction: WhatsAppMessageDirection.outbound,
        role: WhatsAppMessageRole.assistant,
        body: "Necesito el valor del gasto para dejarlo registrado.",
        createdAt: new Date("2026-05-22T11:09:00.000Z"),
      } as unknown as (typeof messages)[number],
    );

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "comercial",
        intent: "clarification",
        summary: "Soporte de gasto recibido por WhatsApp",
        suggested_reply: "Recibi la foto del soporte. Necesito tambien el valor del gasto.",
        requires_human_review: false,
        risk_level: "medium",
        missing_fields: ["amount"],
        proposals: [],
        proposed_order: null,
      }),
    });

    await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: {
          phone_number_id: "phone-number-1",
          message: {
            id: "wamid-expense-image",
            from: "573004445566",
            timestamp: "2026-05-22T20:05:00.000Z",
            image: { id: "image-1" },
            profile: { name: "Sales" },
          },
        },
      })
      .expect(201);

    const noraRouteCall = (globalThis.fetch as jest.Mock).mock.calls.find(
      ([url, options]) => {
        if (url !== "http://localhost:8000/whatsapp/route") {
          return false;
        }

        const body = JSON.parse(String(options?.body ?? "{}")) as { message?: string };
        return body.message === "[Imagen]";
      },
    );

    expect(noraRouteCall).toBeDefined();
    const noraRouteBody = JSON.parse(String(noraRouteCall?.[1]?.body ?? "{}"));

    expect(noraRouteBody).toMatchObject({
      sender_type: "comercial",
      message: "[Imagen]",
      conversation_id: expenseConversation?.id,
      user: {
        id: "sales-user-id",
        role: UserRole.comercial,
        name: "Sales",
        email: "sales@norgtech.local",
      },
    });
    expect(noraRouteBody.recent_messages).toEqual(
      expect.arrayContaining([
        { role: WhatsAppMessageRole.user, body: "registrar gastos" },
        {
          role: WhatsAppMessageRole.assistant,
          body: "Necesito el valor del gasto para dejarlo registrado.",
        },
        { role: WhatsAppMessageRole.user, body: "[Imagen]" },
      ]),
    );
  });

  it("starts an expense case with attachment metadata from a direct support image", async () => {
    const account = {
      id: "account-expense-direct",
      phoneNumberId: "phone-number-expense-direct",
      phoneNumber: "phone-number-expense-direct",
      displayName: "WhatsApp",
      active: true,
    };
    accounts.push(account);

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "comercial",
        intent: "gasto",
        summary: "Soporte de gasto recibido por WhatsApp.",
        suggested_reply:
          "Recibi el soporte. Voy a extraer los datos; si falta cliente o valor, te lo pido enseguida.",
        requires_human_review: false,
        risk_level: "medium",
        missing_fields: [],
        proposals: [],
        case_transition: {
          action: "start_case",
          type: "expense",
          missingFields: ["amount", "expenseDate", "category", "description"],
          lastQuestion:
            "Recibi el soporte. Voy a extraer los datos; si falta cliente o valor, te lo pido enseguida.",
        },
      }),
    });

    try {
      const response = await request(app.getHttpServer())
        .post("/whatsapp/webhooks/kapso")
        .send({
          type: "whatsapp.message.received",
          data: {
            phone_number_id: "phone-number-expense-direct",
            message: {
              id: "wamid-expense-direct-image",
              from: "+573004445566",
              timestamp: "2026-06-21T17:20:00.000Z",
              image: {
                id: "image-direct-1",
                mime_type: "image/jpeg",
                caption: "Factura almuerzo",
              },
              profile: { name: "Sales" },
            },
          },
        })
        .expect(201);

      const conversationId = response.body.conversationId;
      const noraRouteCall = (globalThis.fetch as jest.Mock).mock.calls.find(
        ([url, options]) => {
          if (url !== "http://localhost:8000/whatsapp/route") {
            return false;
          }

          const body = JSON.parse(String(options?.body ?? "{}")) as {
            conversation_id?: string;
          };
          return body.conversation_id === conversationId;
        },
      );
      const noraRouteBody = JSON.parse(String(noraRouteCall?.[1]?.body ?? "{}"));

      expect(noraRouteBody.media).toEqual(
        expect.objectContaining({
          kind: "image",
          providerMediaId: "image-direct-1",
          contentType: "image/jpeg",
          caption: "Factura almuerzo",
        }),
      );
      expect(noraCases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            conversationId,
            type: "expense",
            missingFields: expect.arrayContaining(["amount"]),
            attachments: [
              expect.objectContaining({
                messageId: response.body.messageId,
                kind: "image",
                provider: "kapso",
                providerMediaId: "image-direct-1",
                contentType: "image/jpeg",
                caption: "Factura almuerzo",
              }),
            ],
          }),
        ]),
      );
    } finally {
      const accountIndex = accounts.findIndex((item) => item.id === "account-expense-direct");
      if (accountIndex !== -1) {
        accounts.splice(accountIndex, 1);
      }
      const conversationIndex = conversations.findIndex(
        (item) => item.accountId === "account-expense-direct",
      );
      if (conversationIndex !== -1) {
        const conversationId = conversations[conversationIndex].id;
        conversations.splice(conversationIndex, 1);
        const caseIndex = noraCases.findIndex((item) => item.conversationId === conversationId);
        if (caseIndex !== -1) {
          noraCases.splice(caseIndex, 1);
        }
      }
    }
  });

  it("updates an open expense case and auto-replies without greeting on short acknowledgements", async () => {
    const account = {
      id: "account-expense-ack",
      phoneNumberId: "phone-number-expense-ack",
      phoneNumber: "phone-number-expense-ack",
      displayName: "WhatsApp",
      active: true,
    };
    const conversation = {
      id: "conversation-expense-ack",
      accountId: account.id,
      waId: "+573004445566",
      phone: "+573004445566",
      senderName: "Sales",
      senderType: WhatsAppSenderType.comercial,
      status: WhatsAppConversationStatus.nuevo,
      assignedToUserId: "sales-user-id",
      customerId: null,
      contactId: null,
      lastMessageAt: new Date("2026-06-21T19:19:50.000Z"),
      lastMessageText:
        "Recibi el soporte. Voy a extraer los datos; si falta cliente o valor, te lo pido enseguida.",
      createdAt: new Date("2026-06-21T19:19:00.000Z"),
      updatedAt: new Date("2026-06-21T19:19:50.000Z"),
    };
    const expenseCase = {
      id: "case-expense-ack",
      conversationId: conversation.id,
      parentCaseId: null,
      type: "expense",
      status: "collecting_info",
      extractedData: {},
      missingFields: ["amount", "expenseDate", "category", "description"],
      attachments: [],
      proposal: null,
      lastQuestion:
        "Recibi el soporte. Voy a extraer los datos; si falta cliente o valor, te lo pido enseguida.",
      riskLevel: "medium",
      createdByUserId: "sales-user-id",
      approvedByUserId: null,
      executedEntityType: null,
      executedEntityId: null,
      createdAt: new Date("2026-06-21T19:19:50.000Z"),
      updatedAt: new Date("2026-06-21T19:19:50.000Z"),
    };
    accounts.push(account);
    conversations.push(conversation as unknown as (typeof conversations)[number]);
    noraCases.unshift(expenseCase);

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "comercial",
        intent: "continuar_caso",
        summary: "El usuario continua un caso de gasto abierto.",
        suggested_reply: "Necesito el valor del gasto y el cliente o visita a asociar.",
        requires_human_review: false,
        risk_level: "medium",
        missing_fields: [],
        proposals: [],
        case_transition: {
          action: "update_case",
          caseId: "case-expense-ack",
          type: "expense",
          missingFields: ["amount", "customerId"],
          lastQuestion: "Necesito el valor del gasto y el cliente o visita a asociar.",
        },
      }),
    });

    try {
      const response = await request(app.getHttpServer())
        .post("/whatsapp/webhooks/kapso")
        .send({
          type: "whatsapp.message.received",
          data: {
            phone_number_id: "phone-number-expense-ack",
            message: {
              id: "kapso-expense-ack",
              from: "+573004445566",
              text: { body: "Dale" },
            },
          },
        })
        .expect(201);

      expect(response.body.ignored).toBe(false);
      const noraRouteCall = (globalThis.fetch as jest.Mock).mock.calls.find(
        ([url, options]) => {
          if (url !== "http://localhost:8000/whatsapp/route") {
            return false;
          }

          const body = JSON.parse(String(options?.body ?? "{}")) as { message?: string };
          return body.message === "Dale";
        },
      );
      const noraRouteBody = JSON.parse(String(noraRouteCall?.[1]?.body ?? "{}"));
      expect(noraRouteBody.open_case).toEqual(
        expect.objectContaining({ id: "case-expense-ack", type: "expense" }),
      );

      expect(noraCases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "case-expense-ack",
            missingFields: ["amount", "customerId"],
            lastQuestion: "Necesito el valor del gasto y el cliente o visita a asociar.",
          }),
        ]),
      );
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            conversationId: conversation.id,
            direction: WhatsAppMessageDirection.outbound,
            role: WhatsAppMessageRole.assistant,
            body: "Necesito el valor del gasto y el cliente o visita a asociar.",
          }),
        ]),
      );
    } finally {
      const removeMatching = (
        collection: Array<Record<string, unknown>>,
        predicate: (item: Record<string, unknown>) => boolean,
      ) => {
        let index = collection.findIndex(predicate);
        while (index !== -1) {
          collection.splice(index, 1);
          index = collection.findIndex(predicate);
        }
      };
      removeMatching(noraCases, (item) => item.id === "case-expense-ack");
      removeMatching(conversations, (item) => item.id === "conversation-expense-ack");
      removeMatching(accounts, (item) => item.id === "account-expense-ack");
      removeMatching(messages, (item) => item.conversationId === "conversation-expense-ack");
    }
  });

  it("creates a new-customer subcase when an open order receives crea uno nuevo", async () => {
    const account = {
      id: "account-sergio-case",
      phoneNumberId: "phone-number-case",
      phoneNumber: "phone-number-case",
      displayName: "WhatsApp",
      active: true,
    };
    const conversation = {
      id: "conversation-sergio-case",
      accountId: account.id,
      waId: "+573004445566",
      phone: "+573004445566",
      senderName: "Sales",
      senderType: WhatsAppSenderType.comercial,
      status: WhatsAppConversationStatus.nuevo,
      assignedToUserId: "sales-user-id",
      customerId: null,
      contactId: null,
      lastMessageAt: new Date("2026-06-21T16:10:00.000Z"),
      lastMessageText: "Necesito identificar el cliente antes de continuar.",
      createdAt: new Date("2026-06-21T16:09:00.000Z"),
      updatedAt: new Date("2026-06-21T16:10:00.000Z"),
    };
    const orderCase = {
      id: "case-order-sergio",
      conversationId: conversation.id,
      parentCaseId: null,
      type: "order",
      status: "collecting_info",
      extractedData: {
        companyRef: "Nanonutricion",
        zoneRef: "Costa",
        items: [{ productRef: "Fertilizante", quantity: 5, presentation: "bultos" }],
      },
      missingFields: ["customerId"],
      attachments: [],
      proposal: null,
      lastQuestion: "Necesito identificar el cliente antes de continuar.",
      riskLevel: "high",
      createdByUserId: "sales-user-id",
      approvedByUserId: null,
      executedEntityType: null,
      executedEntityId: null,
      createdAt: new Date("2026-06-21T16:10:00.000Z"),
      updatedAt: new Date("2026-06-21T16:10:00.000Z"),
    };
    accounts.push(account);
    conversations.push(conversation as unknown as (typeof conversations)[number]);
    noraCases.unshift(orderCase);

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "comercial",
        intent: "continuar_caso",
        summary: "El usuario quiere crear una propuesta de cliente nuevo.",
        suggested_reply:
          "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social o nombre comercial.",
        requires_human_review: false,
        risk_level: "high",
        missing_fields: [],
        proposals: [],
        case_transition: {
          action: "create_new_customer_subcase",
          caseId: "case-order-sergio",
          type: "new_customer",
          missingFields: ["displayName", "contactName"],
          lastQuestion:
            "Listo. Para dejar la propuesta de cliente nuevo, dime la razon social o nombre comercial.",
        },
      }),
    });

    try {
      const response = await request(app.getHttpServer())
        .post("/whatsapp/webhooks/kapso")
        .send({
          type: "whatsapp.message.received",
          data: {
            phone_number_id: "phone-number-case",
            message: {
              id: "kapso-create-new-customer",
              from: "+573004445566",
              text: { body: "crea uno nuevo" },
            },
          },
        })
        .expect(201);

      expect(response.body.ignored).toBe(false);
      const noraRouteCall = (globalThis.fetch as jest.Mock).mock.calls.find(
        ([url, options]) => {
          if (url !== "http://localhost:8000/whatsapp/route") {
            return false;
          }

          const body = JSON.parse(String(options?.body ?? "{}")) as { message?: string };
          return body.message === "crea uno nuevo";
        },
      );
      const noraRouteBody = JSON.parse(String(noraRouteCall?.[1]?.body ?? "{}"));
      expect(noraRouteBody.open_case).toEqual(
        expect.objectContaining({ id: "case-order-sergio", type: "order" }),
      );

      expect(noraCases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "new_customer",
            parentCaseId: "case-order-sergio",
            missingFields: expect.arrayContaining(["displayName"]),
          }),
        ]),
      );
    } finally {
      const removeMatching = (
        collection: Array<Record<string, unknown>>,
        predicate: (item: Record<string, unknown>) => boolean,
      ) => {
        let index = collection.findIndex(predicate);
        if (index !== -1) {
          collection.splice(index, 1);
        }
        index = collection.findIndex(predicate);
        if (index !== -1) {
          collection.splice(index, 1);
        }
      };
      removeMatching(
        noraCases,
        (item) => item.id === "case-order-sergio" || item.parentCaseId === "case-order-sergio",
      );
      removeMatching(conversations, (item) => item.id === "conversation-sergio-case");
      removeMatching(accounts, (item) => item.id === "account-sergio-case");
    }
  });

  it("auto-sends Nora first-contact prompts for unregistered senders", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        mode: "cliente",
        intent: "primer_contacto",
        summary: "Numero no registrado inicia conversacion.",
        suggested_reply:
          "Hola, recibimos tu mensaje. Para ayudarte, por favor comparte tu nombre y la empresa o cliente que representas.",
        requires_human_review: false,
        risk_level: "medium",
        missing_fields: [],
        proposals: [],
        proposed_order: null,
      }),
    });

    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .send({
        type: "whatsapp.message.received",
        data: {
          phone_number_id: "phone-number-1",
          message: {
            id: "wamid-first-contact",
            from: "573009990001",
            timestamp: "2026-05-22T20:03:00.000Z",
            text: { body: "Hola, quiero informacion" },
            profile: { name: "Prospecto" },
          },
        },
      })
      .expect(201);

    expect(conversations).toContainEqual(
      expect.objectContaining({
        id: response.body.conversationId,
        senderType: WhatsAppSenderType.desconocido,
        customerId: null,
        contactId: null,
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        conversationId: response.body.conversationId,
        direction: WhatsAppMessageDirection.outbound,
        role: WhatsAppMessageRole.assistant,
        body: expect.stringContaining("comparte tu nombre"),
        deliveryStatus: "sent",
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
        lastMessageText: "Hola Nora, necesito alimento para postura",
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
    expect(
      messages.some(
        (message) =>
          message.conversationId === response.body.conversationId &&
          String(message.direction) === WhatsAppMessageDirection.outbound,
      ),
    ).toBe(false);
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
