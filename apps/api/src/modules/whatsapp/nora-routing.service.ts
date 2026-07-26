import { Injectable, Logger } from "@nestjs/common";
import {
  NoraActionStatus,
  NoraConversationCase,
  NoraConversationCaseStatus,
  NoraConversationCaseType,
  NotificationType,
  Prisma,
  UserRole,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppMessageRole,
  WhatsAppSenderType,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { VisitsService } from "../visits/visits.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NoraCaseAttachment } from "./dto/nora-case.dto";
import { NoraCaseService } from "./nora-case.service";
import { NoraExpenseExtractionService } from "./nora-expense-extraction.service";
import { ProcessOrderAutomationDto } from "./dto/process-order-automation.dto";
import { isAttendableRole } from "./unicanal-roles";
import { ResolvedWhatsAppSender, WhatsAppService } from "./whatsapp.service";
import { WhatsAppOrderAutomationService } from "./whatsapp-order-automation.service";

type RouteInboundMessageInput = {
  conversation: WhatsAppConversation;
  message: WhatsAppMessage;
};

type AutomationRoutingResult = {
  decision: "created" | "needs_clarification" | "human_review";
  reply?: unknown;
  question?: unknown;
  [key: string]: unknown;
};

const VISIT_CASE_TYPE = "visit" as NoraConversationCaseType;

@Injectable()
export class NoraRoutingService {
  private readonly logger = new Logger(NoraRoutingService.name);

  // AI-05: the new-customer field set, kept in sync with Nora's Python router
  // (_NEW_CUSTOMER_REQUIRED_FIELDS / _NEW_CUSTOMER_OPTIONAL_FIELDS in
  // whatsapp_router.py). REQUIRED fields hard-gate creation; OPTIONAL fields are
  // prompted/collected but must NOT block ("no tengo correo" still creates).
  private static readonly NEW_CUSTOMER_REQUIRED_FIELDS = [
    "displayName",
    "taxId",
    "city",
    "phone",
  ];
  private static readonly NEW_CUSTOMER_OPTIONAL_FIELDS = [
    "email",
    "address",
    "department",
    "notes",
  ];
  // Seed order = required first, then optional (mirrors _new_customer_missing_fields).
  private static readonly NEW_CUSTOMER_MISSING_FIELDS_SEED = [
    ...NoraRoutingService.NEW_CUSTOMER_REQUIRED_FIELDS,
    ...NoraRoutingService.NEW_CUSTOMER_OPTIONAL_FIELDS,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
    private readonly orderAutomation: WhatsAppOrderAutomationService,
    private readonly noraCaseService: NoraCaseService,
    private readonly expenseExtraction: NoraExpenseExtractionService,
    private readonly authService: AuthService,
    private readonly visitsService: VisitsService,
    private readonly notifications: NotificationsService,
  ) {}

  async routeInboundMessage({ conversation, message }: RouteInboundMessageInput) {
    let sender = await this.whatsAppService.resolveSenderByPhone(conversation.phone);

    // Un numero que no esta en la agenda quedaba como "desconocido" para
    // siempre: nada leia la respuesta del cliente, asi que Nora repetia el
    // saludo de primer contacto en cada mensaje. Nora le pide el NIT y aqui
    // lo usamos para dejar la conversacion enlazada al cliente.
    let justIdentified = false;
    if (sender.senderType === WhatsAppSenderType.desconocido) {
      sender = (await this.identifyUnknownSender(conversation, message.body)) ?? sender;
      justIdentified =
        !conversation.customerId && sender.senderType === WhatsAppSenderType.cliente;
    }

    await this.updateConversationIdentity(conversation.id, sender);

    if (sender.senderType === WhatsAppSenderType.desconocido && conversation.status === "nuevo") {
      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { status: "pendiente" },
      });
    }

    const input = {
      body: message.body,
      conversationId: conversation.id,
      senderType: sender.senderType,
      customerId: "customerId" in sender ? sender.customerId : null,
      contactId: "contactId" in sender ? sender.contactId : null,
      userId: "userId" in sender ? sender.userId : null,
      userRole: "userRole" in sender ? sender.userRole : null,
    } satisfies Prisma.InputJsonObject;

    const actionLog = await this.prisma.noraActionLog.create({
      data: {
        conversationId: conversation.id,
        ...("userId" in sender && { actorUserId: sender.userId }),
        mode: this.modeFor(sender.senderType),
        action: "classify_inbound_message",
        status: NoraActionStatus.proposed,
        input,
      },
    });

    try {
      const context = await this.whatsAppService.getNoraConversationContext(conversation.id);
      const openCase = await this.noraCaseService.findOpenCase(conversation.id);
      const mediaPayload = this.mediaPayloadFromMessage(message);

      // El mensaje que trae el NIT no dice que necesita el cliente, asi que en
      // vez de mandarlo al agente le confirmamos quien es y le ofrecemos las
      // opciones. Lo que responda ya entra como mensaje normal de cliente.
      if (justIdentified) {
        const customerName = context.customer?.displayName ?? context.customer?.legalName;
        await this.whatsAppService.sendAgentReply(
          conversation.id,
          `${customerName ? `Listo, te identifique como ${customerName}. ` : "Listo, ya te identifique. "}` +
            "Puedo ayudarte a hacer un pedido, consultar el estado de tus pedidos " +
            "o comunicarte con un asesor. ¿Que necesitas?",
        );
        return;
      }

      if (
        "userId" in sender &&
        sender.userId &&
        openCase?.type === VISIT_CASE_TYPE
      ) {
        const handledVisit = await this.handleVisitCaseTurn({
          openCase,
          conversationId: conversation.id,
          messageBody: message.body,
          sender,
          actionLogId: actionLog.id,
        });
        if (handledVisit) {
          return handledVisit;
        }
      }

      if (
        "userId" in sender &&
        sender.userId &&
        this.isExpenseFlowTurn(openCase?.type, message.body)
      ) {
        try {
          const scopedToken = await this.authService.mintScopedToken(sender.userId);
          const agentResponse = await this.requestNoraAgent({
            current_message: message.body,
            history: context.recent_messages,
            open_case: openCase
              ? {
                  id: openCase.id,
                  type: openCase.type,
                  status: openCase.status,
                  extractedData: openCase.extractedData,
                  missingFields: Array.isArray(openCase.missingFields)
                    ? openCase.missingFields
                    : [],
                  lastQuestion: openCase.lastQuestion,
                  attachments: openCase.attachments,
                }
              : null,
            conversation_id: conversation.id,
            auth: `Bearer ${scopedToken}`,
          });

          if (agentResponse.case_update && openCase) {
            await this.noraCaseService.updateCase(openCase.id, agentResponse.case_update);
          }

          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              status: agentResponse.executed_entity
                ? NoraActionStatus.executed
                : NoraActionStatus.proposed,
              output: agentResponse as unknown as Prisma.InputJsonObject,
            },
          });

          if (agentResponse.reply_text) {
            await this.whatsAppService.sendAgentReply(conversation.id, agentResponse.reply_text);
          }
          return;
        } catch (error) {
          this.logger.error(
            `Nora agent expense flow failed, falling back to planner: ${String(error)}`,
          );
          // fall through to the planner path below
        }
      }

      if (
        process.env.NORA_WHATSAPP_GENERAL_AGENT === "true" &&
        "userId" in sender &&
        sender.userId &&
        (!openCase ||
          openCase.type === NoraConversationCaseType.new_customer ||
          this.isVisitDeleteMessage(message.body) ||
          this.isEntityEditMessage(message.body)) &&
        !this.isNewCustomerStartMessage(message.body) &&
        !this.isVisitStartMessage(message.body) &&
        !mediaPayload
      ) {
        try {
          const scopedToken = await this.authService.mintScopedToken(sender.userId);
          // AI-09/AI-10: borrar una visita es destructivo. Con el historial
          // completo, un turno anterior de descripcion (de un intento de EDITAR)
          // se colaba y delete_visit lo tomaba como la visita a eliminar,
          // borrando la equivocada. Para un borrado se manda SOLO el mensaje
          // actual: el agente vuelve a listar las visitas del cliente y confirma
          // cual, en vez de inferirla de contexto viejo.
          const isVisitDelete = this.isVisitDeleteMessage(message.body);
          const agentResponse = await this.requestNoraGeneralAgent({
            current_message: message.body,
            history: isVisitDelete ? [] : context.recent_messages,
            open_case: openCase
              ? {
                  id: openCase.id,
                  type: openCase.type,
                  status: openCase.status,
                  extractedData: openCase.extractedData,
                  missingFields: Array.isArray(openCase.missingFields)
                    ? openCase.missingFields
                    : [],
                  lastQuestion: openCase.lastQuestion,
                  attachments: openCase.attachments,
                }
              : null,
            conversation_id: conversation.id,
            auth: `Bearer ${scopedToken}`,
          });

          if (agentResponse.case_update && openCase) {
            await this.noraCaseService.updateCase(openCase.id, agentResponse.case_update);
          }

          const bridgeReply = openCase
            ? await this.bridgeNewCustomerToParentVisit({
                customerCase: openCase,
                executedEntity: agentResponse.executed_entity,
                conversationId: conversation.id,
              })
            : undefined;

          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              status: agentResponse.executed_entity
                ? NoraActionStatus.executed
                : NoraActionStatus.proposed,
              output: agentResponse as unknown as Prisma.InputJsonObject,
            },
          });

          const replyToSend = bridgeReply ?? agentResponse.reply_text;
          if (replyToSend) {
            await this.whatsAppService.sendAgentReply(conversation.id, replyToSend);
          }
          return;
        } catch (error) {
          this.logger.error(
            `Nora general agent failed, falling back to planner: ${String(error)}`,
          );
          // El planner responde el saludo generico, que a mitad de un pedido se
          // lee como si Nora se hubiera perdido: dejar el error en el log es lo
          // unico que permite saber despues por que se cayo el turno.
          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: { error: this.safeErrorMessage(error) },
          });
          // fall through to the planner path below
        }
      }

      if (
        sender.senderType === WhatsAppSenderType.cliente &&
        (conversation.assignedToRole || conversation.assignedToUserId) &&
        (conversation.status === "pendiente" || conversation.status === "en_gestion")
      ) {
        return;
      }

      // Ya le pedimos el NIT (eso puso la conversacion en "pendiente") y
      // seguimos sin reconocerlo: pasa a un humano en vez de repetir el saludo
      // de primer contacto indefinidamente.
      if (
        sender.senderType === WhatsAppSenderType.desconocido &&
        conversation.status !== "nuevo" &&
        // Solo escalamos si de verdad intento identificarse con un NIT que no
        // existe. Un "Hola" repetido no es un intento fallido: se le vuelve a
        // pedir el NIT, y si insiste sin darlo lo pasamos igual a un humano.
        (this.looksLikeNit(message.body) || this.senderTurns(context) >= 4)
      ) {
        if (!conversation.assignedToRole && !conversation.assignedToUserId) {
          await this.prisma.whatsAppConversation.update({
            where: { id: conversation.id },
            data: { assignedToRole: UserRole.comercial, status: "pendiente" },
          });
          await this.whatsAppService.sendAgentReply(
            conversation.id,
            "Gracias. No pude identificar tu empresa con ese NIT; " +
              "un asesor te va a contactar en breve.",
          );
        }
        return;
      }

      if (
        process.env.NORA_WHATSAPP_CUSTOMER_AGENT === "true" &&
        sender.senderType === WhatsAppSenderType.cliente &&
        "customerId" in sender &&
        sender.customerId &&
        !openCase &&
        !mediaPayload
      ) {
        try {
          const customerSnapshot = await this.buildCustomerSnapshot(sender.customerId);
          const agentResponse = await this.requestNoraCustomerAgent({
            current_message: message.body,
            history: context.recent_messages,
            conversation_id: conversation.id,
            auth: "",
            customer_snapshot: customerSnapshot,
          });

          if (agentResponse.order_case) {
            const draft = agentResponse.order_case;
            const normalizedRef = draft.orderRef?.trim().toLowerCase();
            const referenced = normalizedRef
              ? customerSnapshot.recentOrders.find(
                  (o) => o.orderNumber?.trim().toLowerCase() === normalizedRef,
                )
              : undefined;

            const items = referenced
              ? referenced.items
                  .map((it) => ({ productRef: it.productRef, quantity: it.quantity }))
                  .filter((it) => it.productRef && Number.isFinite(it.quantity) && it.quantity > 0)
              : (draft.items ?? [])
                  .map((it) => ({
                    productRef: this.stringValue(it.productRef) ?? this.stringValue(it.product_ref),
                    quantity: Number(it.quantity),
                    // El empaque que confirmo el cliente: sin esto el pedido sale
                    // en la presentacion que adivine el CRM (10 bolsas de 500 g
                    // cuando pidio 10 kilos).
                    ...(this.stringValue(it.presentation) && {
                      presentation: this.stringValue(it.presentation),
                    }),
                  }))
                  .filter((it) => it.productRef && Number.isFinite(it.quantity) && it.quantity > 0);

            if (items.length === 0) {
              await this.prisma.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { assignedToRole: UserRole.comercial, status: "pendiente", assignedToUserId: null },
              });

              await this.prisma.noraActionLog.update({
                where: { id: actionLog.id },
                data: {
                  status: NoraActionStatus.proposed,
                  output: agentResponse as unknown as Prisma.InputJsonObject,
                },
              });

              await this.whatsAppService.sendAgentReply(
                conversation.id,
                "Ya un asesor te va a contactar para ayudarte con tu pedido.",
              );
              return;
            }

            if (items.length > 0) {
              const chosenZoneId = this.zoneChosenByCustomer(customerSnapshot.zonas, draft.zona);
              const orderCase = await this.noraCaseService.createCase({
                conversationId: conversation.id,
                type: NoraConversationCaseType.order,
                status: NoraConversationCaseStatus.ready_for_review,
                createdByUserId: null,
                extractedData: {
                  customerId: sender.customerId,
                  // El cliente no sabe de empresas internas ni elige zona: tomamos
                  // las del propio cliente para que el asesor pueda aceptar el caso
                  // sin datos faltantes. Si repite un pedido, mandan los de ese.
                  ...(await this.orderDefaultsForCustomer(sender.customerId)),
                  ...(chosenZoneId && { customerZoneId: chosenZoneId }),
                  ...(referenced?.companyRef && { companyRef: referenced.companyRef }),
                  ...(referenced?.customerZoneId && { customerZoneId: referenced.customerZoneId }),
                  items,
                  notes: draft.motivo,
                },
              });

              // El pedido salio bien: en la CONVERSACION no queda nada pendiente,
              // lo pendiente es el caso (que tiene su notificacion y su boton en
              // el panel). Con "pendiente" + asignada, la regla del unicanal calla
              // a Nora y el cliente queda bloqueado hasta que un asesor abra la
              // bandeja, sin que nadie se entere. Sigue asignada al rol para que
              // el equipo la vea, pero resuelta para que Nora lo siga atendiendo.
              await this.prisma.whatsAppConversation.update({
                where: { id: conversation.id },
                data: {
                  assignedToRole: UserRole.comercial,
                  status: "resuelto",
                  assignedToUserId: null,
                },
              });

              await this.prisma.noraActionLog.update({
                where: { id: actionLog.id },
                data: {
                  status: NoraActionStatus.proposed,
                  output: agentResponse as unknown as Prisma.InputJsonObject,
                },
              });

              // Nora tiene prohibido inventar precios, asi que el valor lo
              // calcula el backend con la lista del cliente y se pega a la
              // confirmacion: despues del pedido la conversacion queda con un
              // humano y Nora ya no puede responder "cuanto vale".
              const estimate = await this.orderAutomation.estimateForCustomer(
                sender.customerId,
                items as Array<{ productRef: string; quantity: number }>,
              );

              await this.notifyWhatsAppOrder({
                caseId: orderCase.id,
                customerId: sender.customerId,
                customerName: customerSnapshot.customerName,
                items: items as Array<{ productRef: string; quantity: number }>,
                total: estimate?.total ?? null,
              });

              if (agentResponse.reply_text) {
                await this.whatsAppService.sendAgentReply(
                  conversation.id,
                  estimate
                    ? `${agentResponse.reply_text}\n\nValor estimado: ${this.formatCop(estimate.total)} con IVA. El asesor lo confirma al procesarlo.`
                    : agentResponse.reply_text,
                );
              }
              return;
            }
          }

          if (agentResponse.handoff?.needed) {
            const rol = agentResponse.handoff.rol?.trim();
            if (isAttendableRole(rol)) {
              await this.prisma.whatsAppConversation.update({
                where: { id: conversation.id },
                data: { assignedToRole: rol, status: "pendiente", assignedToUserId: null },
              });
            } else {
              this.logger.warn(
                `Customer handoff sin rol válido (${rol ?? "n/d"}) — no se asigna, Nora re-pregunta`,
              );
              if (!agentResponse.reply_text) {
                await this.whatsAppService.sendAgentReply(
                  conversation.id,
                  "¿Con qué área querés hablar: comercial, soporte técnico, facturación o entregas?",
                );
              }
            }
          }

          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              status: agentResponse.handoff?.needed
                ? NoraActionStatus.proposed
                : NoraActionStatus.executed,
              output: agentResponse as unknown as Prisma.InputJsonObject,
            },
          });

          if (agentResponse.reply_text) {
            await this.whatsAppService.sendAgentReply(conversation.id, agentResponse.reply_text);
          }
          return;
        } catch (error) {
          this.logger.error(
            `Nora customer agent failed, falling back to planner: ${String(error)}`,
          );
          // fall through to the planner path below
        }
      }

      const noraResponse = await this.requestNoraRoute({
        sender_type: sender.senderType,
        message: message.body,
        conversation_id: conversation.id,
        customer:
          context.customer ??
          ("customerId" in sender
            ? {
                id: sender.customerId,
              }
            : undefined),
        contact: context.contact ?? undefined,
        companies: context.companies,
        customer_zones: context.customer_zones,
        recent_messages: context.recent_messages,
        ...(openCase && { open_case: this.openCasePayload(openCase) }),
        ...(mediaPayload && { media: mediaPayload }),
        ...("userId" in sender
          ? {
              user: {
                id: sender.userId,
                role: sender.userRole,
                name: sender.userName,
                email: sender.userEmail,
              },
            }
          : {}),
      });

      const automationResult = await this.processOrderCandidate(
        noraResponse,
        conversation.id,
        sender,
      );

      if (automationResult?.decision === "created") {
        const orderCase = await this.noraCaseService.findOpenCase(conversation.id);
        if (orderCase && orderCase.type === NoraConversationCaseType.order) {
          await this.noraCaseService.updateCase(orderCase.id, {
            status: NoraConversationCaseStatus.executed,
          });
        }
      }

      const caseResult = await this.processCaseTransition(
        noraResponse,
        conversation.id,
        message,
        sender,
      );
      const visitCaseReply = caseResult
        ? await this.prepareVisitCaseReply(caseResult)
        : undefined;
      const output = {
        ...noraResponse,
        ...(automationResult && { order_automation: this.toJsonSafeValue(automationResult) }),
        ...(caseResult && { case_transition_result: this.toJsonSafeValue(caseResult) }),
        ...(visitCaseReply && { visit_case_reply: visitCaseReply }),
      };

      await this.persistIntentTag(conversation.id, noraResponse);

      const updatedLog = await this.prisma.noraActionLog.update({
        where: { id: actionLog.id },
        data: {
          status:
            automationResult?.decision === "created"
              ? NoraActionStatus.executed
              : NoraActionStatus.proposed,
          output: output as Prisma.InputJsonValue,
        },
      });

      const suggestedReply =
        visitCaseReply?.reply ?? this.extractSuggestedReply(noraResponse, automationResult);
      if (suggestedReply && this.shouldAutoReply(noraResponse, automationResult)) {
        try {
          await this.whatsAppService.sendAgentReply(conversation.id, suggestedReply);
          this.logger.log(`Nora auto-replied to conversation ${conversation.id}: "${suggestedReply.substring(0, 60)}..."`);
        } catch (sendError) {
          this.logger.error(`Failed to send Nora reply to conversation ${conversation.id}: ${this.safeErrorMessage(sendError)}`);
          await this.prisma.noraActionLog.update({
            where: { id: actionLog.id },
            data: {
              error: this.safeErrorMessage(sendError),
            },
          });
        }
      }

      // Once the case exists and the immediate reply is out, run OCR on the
      // attached support in the background so we never block the webhook.
      if (caseResult && mediaPayload && this.isStartExpenseTransition(noraResponse)) {
        this.expenseExtraction.extractForCaseInBackground({
          caseId: caseResult.id,
          conversationId: conversation.id,
          message,
        });
      }

      return updatedLog;
    } catch (error) {
      return this.prisma.noraActionLog.update({
        where: { id: actionLog.id },
        data: {
          status: NoraActionStatus.failed,
          error: this.safeErrorMessage(error),
        },
      });
    }
  }

  private async handleVisitCaseTurn(input: {
    openCase: NoraConversationCase;
    conversationId: string;
    messageBody: string;
    sender: ResolvedWhatsAppSender;
    actionLogId: string;
  }) {
    const data = this.objectValue(input.openCase.extractedData) ?? {};

    // Escape hatch: a fresh "crear/registrar visita" while a visit case is open
    // restarts collection, so a bad customerRef (e.g. mis-parsed "las 7am") can
    // never trap the user in a loop with no way out.
    if (this.isVisitStartMessage(input.messageBody)) {
      const reply =
        "Listo, empecemos de nuevo. Dime el cliente, la fecha y hora, y una breve descripción de la visita.";
      await this.noraCaseService.updateCase(input.openCase.id, {
        extractedData: {
          customerId: "",
          customerLabel: "",
          customerRef: "",
          scheduledAt: "",
          summary: "",
        },
        missingFields: ["customerRef", "scheduledAt", "summary"],
        lastQuestion: reply,
      });
      await this.whatsAppService.sendAgentReply(input.conversationId, reply);
      return this.prisma.noraActionLog.update({
        where: { id: input.actionLogId },
        data: { status: NoraActionStatus.proposed, output: { reply } },
      });
    }

    if (this.isNewCustomerStartMessage(input.messageBody)) {
      const reply =
        "Listo. Para crear el cliente nuevo y luego retomar la visita, dime la razón social o nombre comercial y el NIT.";
      const customerCase = await this.noraCaseService.createCase({
        conversationId: input.conversationId,
        parentCaseId: input.openCase.id,
        type: NoraConversationCaseType.new_customer,
        status: NoraConversationCaseStatus.collecting_info,
        extractedData: {},
        missingFields: [...NoraRoutingService.NEW_CUSTOMER_MISSING_FIELDS_SEED],
        proposal: {
          type: "new_customer",
          title: "Cliente nuevo para visita",
          payload: {},
        },
        lastQuestion: reply,
        riskLevel: "high",
        createdByUserId: "userId" in input.sender ? input.sender.userId : null,
      });
      await this.whatsAppService.sendAgentReply(input.conversationId, reply);
      return this.prisma.noraActionLog.update({
        where: { id: input.actionLogId },
        data: {
          status: NoraActionStatus.proposed,
          output: { reply, case_transition_result: this.toJsonSafeValue(customerCase) },
        },
      });
    }

    if (this.isNegativeVisitSelection(input.messageBody)) {
      const reply =
        "Listo. Dime otro nombre o NIT del cliente. Si toca crearlo, escribe 'crear cliente' y te pido los datos.";
      await this.noraCaseService.updateCase(input.openCase.id, {
        extractedData: { customerId: "", customerLabel: "" },
        missingFields: ["customerRef"],
        lastQuestion: reply,
      });
      await this.whatsAppService.sendAgentReply(input.conversationId, reply);
      return this.prisma.noraActionLog.update({
        where: { id: input.actionLogId },
        data: { status: NoraActionStatus.proposed, output: { reply } },
      });
    }

    const selectedFromList = this.visitSelectionNumber(input.messageBody);
    if (selectedFromList) {
      const match = this.visitMatchByNumber(input.openCase, selectedFromList);
      if (match) {
        const nextData = {
          customerId: match.id,
          customerLabel: this.customerDisplay(match),
          customerRef: this.customerDisplay(match),
        };
        const merged = { ...data, ...nextData };
        const reply = this.visitConfirmationQuestion(merged);
        await this.noraCaseService.updateCase(input.openCase.id, {
          extractedData: nextData,
          missingFields: [],
          lastQuestion: reply,
        });
        await this.whatsAppService.sendAgentReply(input.conversationId, reply);
        return this.prisma.noraActionLog.update({
          where: { id: input.actionLogId },
          data: { status: NoraActionStatus.proposed, output: { selectedCustomer: match, reply } },
        });
      }
    }

    if (!this.isConfirmationMessage(input.messageBody)) {
      return undefined;
    }

    const customerId = this.stringValue(data.customerId);
    const scheduledAt = this.stringValue(data.scheduledAt);
    const summary = this.stringValue(data.summary);
    if (!customerId || !scheduledAt || !summary) {
      return undefined;
    }

    const actor = this.authUserFor(input.sender);
    if (!actor) {
      return undefined;
    }

    const visit = await this.visitsService.create(actor, {
      customerId,
      scheduledAt,
      summary,
      notes: this.stringValue(data.rawMessage) ?? undefined,
      assignedToUserId: actor.id,
    });

    await this.noraCaseService.updateCase(input.openCase.id, {
      status: NoraConversationCaseStatus.executed,
      executedEntityType: "Visit",
      executedEntityId: visit.id,
    });

    const reply = `Listo. Registré la visita para ${this.stringValue(data.customerLabel) ?? "el cliente"} el ${this.formatVisitDate(scheduledAt)}.`;
    await this.whatsAppService.sendAgentReply(input.conversationId, reply);
    return this.prisma.noraActionLog.update({
      where: { id: input.actionLogId },
      data: {
        status: NoraActionStatus.executed,
        output: {
          reply,
          executed_entity: { type: "Visit", id: visit.id },
        },
      },
    });
  }

  /**
   * After the general agent creates a new customer that was opened to unblock a
   * visit (new_customer subcase with a parent visit case), link the fresh
   * customer to the parent visit and return the confirmation question so the
   * flow resumes automatically instead of stalling on the stale customerRef.
   */
  private async bridgeNewCustomerToParentVisit(input: {
    customerCase: NoraConversationCase;
    executedEntity: Record<string, unknown> | null;
    conversationId: string;
  }): Promise<string | undefined> {
    const entity = this.objectValue(input.executedEntity);
    const customerId = this.stringValue(entity?.id);
    if (
      input.customerCase.type !== NoraConversationCaseType.new_customer ||
      entity?.type !== "Customer" ||
      !customerId ||
      !input.customerCase.parentCaseId
    ) {
      return undefined;
    }

    const parent = await this.prisma.noraConversationCase.findFirst({
      where: { id: input.customerCase.parentCaseId, conversationId: input.conversationId },
    });
    if (!parent || parent.type !== VISIT_CASE_TYPE) {
      return undefined;
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { displayName: true, legalName: true },
    });
    const label = this.customerDisplay(customer ?? {});
    const parentData = this.objectValue(parent.extractedData) ?? {};
    const nextData = { customerId, customerLabel: label, customerRef: label };
    const reply = this.visitConfirmationQuestion({ ...parentData, ...nextData });
    await this.noraCaseService.updateCase(parent.id, {
      extractedData: nextData,
      missingFields: [],
      lastQuestion: reply,
    });
    return reply;
  }

  private async prepareVisitCaseReply(caseResult: NoraConversationCase) {
    if (caseResult.type !== VISIT_CASE_TYPE) {
      return undefined;
    }

    const data = this.objectValue(caseResult.extractedData) ?? {};
    const missing = Array.isArray(caseResult.missingFields)
      ? caseResult.missingFields.filter((item): item is string => typeof item === "string")
      : [];

    if (missing.length > 0) {
      return { reply: caseResult.lastQuestion ?? "Me falta un dato para crear la visita." };
    }

    if (this.stringValue(data.customerId)) {
      const reply = this.visitConfirmationQuestion(data);
      await this.noraCaseService.updateCase(caseResult.id, { lastQuestion: reply });
      return { reply };
    }

    const customerRef = this.stringValue(data.customerRef);
    if (!customerRef) {
      return { reply: "Me falta el cliente de la visita. Puedes decirme el nombre o NIT." };
    }

    const matches = await this.findVisitCustomerMatches(customerRef);
    if (matches.length === 0) {
      const reply =
        `No encontré un cliente con el nombre "${customerRef}". ` +
        "Verifica el nombre o pásame el NIT. Si es cliente nuevo, responde 'crear cliente'.";
      await this.noraCaseService.updateCase(caseResult.id, {
        missingFields: ["customerRef"],
        lastQuestion: reply,
      });
      return { reply };
    }

    if (matches.length === 1) {
      const match = matches[0];
      const nextData = {
        customerId: match.id,
        customerLabel: this.customerDisplay(match),
        customerRef: this.customerDisplay(match),
      };
      const reply = this.visitConfirmationQuestion({ ...data, ...nextData });
      await this.noraCaseService.updateCase(caseResult.id, {
        extractedData: nextData,
        missingFields: [],
        proposal: {
          type: "visit",
          title: "Visita por confirmar",
          payload: { customerMatches: matches },
        },
        lastQuestion: reply,
      });
      return { reply, matches };
    }

    const reply =
      "Encontré varios clientes parecidos:\n" +
      matches.map((match, index) => `${index + 1}. ${this.customerDisplay(match)}${match.taxId ? ` - NIT ${match.taxId}` : ""}`).join("\n") +
      "\nResponde con el número correcto, otro nombre/NIT o 'crear cliente'.";
    await this.noraCaseService.updateCase(caseResult.id, {
      missingFields: ["customerId"],
      proposal: {
        type: "visit_customer_matches",
        title: "Coincidencias de cliente para visita",
        payload: { customerMatches: matches },
      },
      lastQuestion: reply,
    });
    return { reply, matches };
  }

  private async findVisitCustomerMatches(query: string) {
    const normalizedQuery = this.normalizeText(query);
    const directMatches = await this.prisma.customer.findMany({
      where: {
        active: true,
        OR: [
          { displayName: { contains: query, mode: "insensitive" } },
          { legalName: { contains: query, mode: "insensitive" } },
          { taxId: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, displayName: true, legalName: true, taxId: true, city: true },
      orderBy: { displayName: "asc" },
      take: 5,
    });

    if (directMatches.length > 0) {
      return directMatches;
    }

    const customers = await this.prisma.customer.findMany({
      where: { active: true },
      select: { id: true, displayName: true, legalName: true, taxId: true, city: true },
      orderBy: { displayName: "asc" },
      take: 100,
    });

    return customers
      .map((customer) => ({
        customer,
        score: Math.max(
          this.similarity(normalizedQuery, this.normalizeText(customer.displayName)),
          this.similarity(normalizedQuery, this.normalizeText(customer.legalName)),
          this.similarity(normalizedQuery, this.normalizeText(customer.taxId)),
        ),
      }))
      .filter((item) => item.score >= 0.72)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.customer);
  }

  /**
   * Un pedido que entra por WhatsApp no lo ve nadie hasta que alguien abre la
   * bandeja. Avisamos al vendedor del cliente y a los administradores para que
   * el caso no se quede esperando.
   *
   * ponytail: reusa el tipo `pedido_hito` en vez de agregar uno al enum (seria
   * una migracion en prod y el enum esta espejado en Nora). La campana no
   * discrimina por tipo, muestra titulo y cuerpo.
   */
  private async notifyWhatsAppOrder(input: {
    caseId: string;
    customerId: string;
    customerName: string | null;
    items: Array<{ productRef: string; quantity: number }>;
    total: number | null;
  }) {
    try {
      const [customer, supervisors] = await Promise.all([
        this.prisma.customer.findUnique({
          where: { id: input.customerId },
          select: { assignedToUserId: true },
        }),
        this.prisma.user.findMany({
          where: {
            active: true,
            role: { in: [UserRole.administrador, UserRole.director_comercial] },
          },
          select: { id: true },
        }),
      ]);

      const detail = input.items
        .map((item) => `${item.quantity} x ${item.productRef}`)
        .join(", ");

      await this.notifications.emit({
        userIds: [
          ...supervisors.map((user) => user.id),
          ...(customer?.assignedToUserId ? [customer.assignedToUserId] : []),
        ],
        type: NotificationType.pedido_hito,
        title: `Pedido nuevo por WhatsApp: ${input.customerName ?? "cliente"}`,
        body: `${detail}${input.total !== null ? ` — ${this.formatCop(input.total)}` : ""}. Pendiente de revision en la bandeja.`,
        entityType: "NoraConversationCase",
        entityId: input.caseId,
      });
    } catch (error) {
      // El pedido ya quedo armado: que falle el aviso no puede tumbar el flujo.
      this.logger.error(`No se pudo notificar el pedido de WhatsApp: ${String(error)}`);
    }
  }

  private formatCop(amount: number) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /** Zona que eligio el cliente, resuelta contra las suyas (nunca inventa una). */
  private zoneChosenByCustomer(
    zonas: Array<{ id: string; nombre: string }>,
    zona?: string | null,
  ) {
    const normalized = this.normalizeText(zona);
    if (!normalized) {
      return undefined;
    }
    return zonas.find((item) => this.normalizeText(item.nombre) === normalized)?.id;
  }

  /**
   * Empresa y zona con las que el asesor puede aceptar el pedido sin volver a
   * preguntar. La zona solo se asume cuando el cliente tiene una sola activa;
   * con varias queda vacia a proposito para que la elija un humano.
   */
  private async orderDefaultsForCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        companyId: true,
        customerZones: { where: { isActive: true }, select: { id: true } },
      },
    });

    return {
      ...(customer?.companyId && { companyRef: customer.companyId }),
      ...(customer?.customerZones?.length === 1 && {
        customerZoneId: customer.customerZones[0].id,
      }),
    };
  }

  private looksLikeNit(messageBody: string) {
    return /\d{5,}/.test(messageBody.replace(/[.\- ]/g, ""));
  }

  private senderTurns(context: { recent_messages: Array<{ role: string }> }) {
    // recent_messages trae los ultimos 8 turnos, suficiente para el tope.
    return context.recent_messages.filter(
      (message) => message.role === WhatsAppMessageRole.user,
    ).length;
  }

  private async identifyUnknownSender(
    conversation: WhatsAppConversation,
    messageBody: string,
  ): Promise<ResolvedWhatsAppSender | null> {
    if (conversation.customerId) {
      return {
        senderType: WhatsAppSenderType.cliente,
        customerId: conversation.customerId,
        contactId: conversation.contactId,
      };
    }

    const customer = await this.identifyCustomerFromMessage(messageBody);
    if (!customer) {
      return null;
    }

    // Varias personas de la misma empresa escriben desde numeros distintos, asi
    // que cada conversacion queda con el mismo cliente. Guardamos con quien
    // hablamos para poder distinguirlas en la bandeja; el nombre del perfil de
    // WhatsApp manda si ya lo tenemos.
    if (!conversation.senderName) {
      const senderName = this.senderNameFromMessage(messageBody);
      if (senderName) {
        await this.prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { senderName },
        });
      }
    }

    this.logger.log(
      `Conversacion ${conversation.id} identificada como cliente ${customer.id} por el NIT`,
    );
    return {
      senderType: WhatsAppSenderType.cliente,
      customerId: customer.id,
      contactId: null,
    };
  }

  private static readonly SENDER_NAME_FILLERS = new Set([
    "hola",
    "buenas",
    "buenos",
    "dias",
    "tardes",
    "noches",
    "nit",
    "mi",
    "es",
    "soy",
    "gracias",
    "empresa",
    "de",
    "la",
    "el",
    "con",
    "que",
  ]);

  /**
   * Saca el nombre de quien escribe del mismo mensaje del NIT ("Soy Omar, NIT
   * 890201881-4"). Es solo la etiqueta de la bandeja, por eso ante la duda
   * devuelve null y se conserva el nombre del perfil de WhatsApp.
   */
  private senderNameFromMessage(messageBody: string) {
    const withoutNit = messageBody.replace(/\d[\d.\- ]{4,}\d/g, " ");
    const explicit = withoutNit.match(
      /\b(?:soy|me llamo|mi nombre es|nombre\s*:)\s+([\p{L}][\p{L}\s]{2,40})/iu,
    );
    const words = (explicit?.[1] ?? withoutNit)
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 2);

    if (explicit) {
      // "Soy Omar de AVSA" -> "Omar": el nombre termina donde empieza el relleno.
      const nameWords: string[] = [];
      for (const word of words.slice(0, 3)) {
        if (NoraRoutingService.SENDER_NAME_FILLERS.has(this.normalizeText(word))) {
          break;
        }
        nameWords.push(word);
      }
      return nameWords.join(" ") || null;
    }

    // Sin "soy"/"me llamo" solo aceptamos un texto corto que sea puro nombre.
    const clean = words.filter(
      (word) => !NoraRoutingService.SENDER_NAME_FILLERS.has(this.normalizeText(word)),
    );
    return clean.length > 0 && clean.length <= 3 && clean.length === words.length
      ? clean.join(" ")
      : null;
  }

  /**
   * Busca el NIT que escribe un numero desconocido ("890201881-4", "890201881").
   * Compara solo digitos porque el taxId se guarda con puntos/guiones libres, y
   * tolera que falte el digito de verificacion. Solo enlaza cuando hay UNA sola
   * coincidencia: si no, la conversacion pasa a un humano.
   */
  private async identifyCustomerFromMessage(messageBody: string) {
    const messageNits = (messageBody.match(/\d[\d.\- ]{4,}\d/g) ?? []).map((value) =>
      value.replace(/\D/g, ""),
    );
    if (messageNits.length === 0) {
      return null;
    }

    // ponytail: comparacion en memoria (~500 clientes). Si crece, guardar el
    // taxId normalizado en una columna indexada y filtrar en SQL.
    const candidates = await this.prisma.customer.findMany({
      where: { active: true },
      select: { id: true, taxId: true },
    });

    const matches = candidates.filter((customer) => {
      const digits = (customer.taxId ?? "").replace(/\D/g, "");
      return (
        digits.length >= 6 &&
        messageNits.some((nit) => nit.startsWith(digits) || digits.startsWith(nit))
      );
    });
    return matches.length === 1 ? matches[0] : null;
  }

  private visitConfirmationQuestion(data: Record<string, unknown>) {
    const customer = this.stringValue(data.customerLabel) ?? this.stringValue(data.customerRef) ?? "el cliente";
    const scheduledAt = this.stringValue(data.scheduledAt);
    const summary = this.stringValue(data.summary) ?? "Visita comercial";
    return (
      `Encontré este cliente: ${customer}. ` +
      `¿Confirmas la visita para ${scheduledAt ? this.formatVisitDate(scheduledAt) : "la fecha indicada"} ` +
      `con resumen "${summary}"? Responde sí para crearla, otro nombre/NIT para cambiar cliente o 'crear cliente'.`
    );
  }

  private visitMatchByNumber(caseRecord: NoraConversationCase, number: number) {
    const proposal = this.objectValue(caseRecord.proposal);
    const payload = this.objectValue(proposal?.payload);
    const matches = Array.isArray(payload?.customerMatches) ? payload.customerMatches : [];
    const match = matches[number - 1];
    return match && typeof match === "object" && !Array.isArray(match)
      ? (match as { id: string; displayName?: string | null; legalName?: string | null; taxId?: string | null; city?: string | null })
      : undefined;
  }

  private customerDisplay(customer: { displayName?: string | null; legalName?: string | null }) {
    return customer.displayName || customer.legalName || "Cliente sin nombre";
  }

  private authUserFor(sender: ResolvedWhatsAppSender): AuthUser | undefined {
    if (!("userId" in sender) || !sender.userId || !sender.userRole) {
      return undefined;
    }
    return {
      id: sender.userId,
      role: sender.userRole,
      email: sender.userEmail ?? "",
    };
  }

  private visitSelectionNumber(message: string) {
    const match = message.trim().match(/^\d+$/);
    if (!match) {
      return undefined;
    }
    const value = Number(match[0]);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private isNegativeVisitSelection(message: string) {
    const normalized = this.normalizeText(message);
    return normalized === "ninguno" || normalized === "ninguna" || normalized === "no es ninguno";
  }

  private isConfirmationMessage(message: string) {
    return [
      "si",
      "sí",
      "ok",
      "okay",
      "okey",
      "dale",
      "listo",
      "confirmo",
      "correcto",
      "perfecto",
      "de acuerdo",
    ].includes(this.normalizeText(message));
  }

  private formatVisitDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Bogota",
    }).format(date);
  }

  private normalizeText(value: unknown) {
    return typeof value === "string"
      ? value
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
      : "";
  }

  private similarity(a: string, b: string) {
    if (!a || !b) {
      return 0;
    }
    if (a === b) {
      return 1;
    }
    if (a.includes(b) || b.includes(a)) {
      return 0.9;
    }
    const aTokens = new Set(a.split(" ").filter(Boolean));
    const bTokens = new Set(b.split(" ").filter(Boolean));
    const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
    const union = new Set([...aTokens, ...bTokens]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private modeFor(senderType: WhatsAppSenderType) {
    if (
      senderType === WhatsAppSenderType.cliente ||
      senderType === WhatsAppSenderType.desconocido
    ) {
      return "cliente";
    }

    if (senderType === WhatsAppSenderType.admin) {
      return "admin";
    }

    return "comercial";
  }

  private updateConversationIdentity(conversationId: string, sender: ResolvedWhatsAppSender) {
    if (sender.senderType === WhatsAppSenderType.cliente) {
      return this.prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          senderType: sender.senderType,
          customerId: sender.customerId,
          contactId: sender.contactId,
        },
      });
    }

    if (
      sender.senderType === WhatsAppSenderType.admin ||
      sender.senderType === WhatsAppSenderType.comercial
    ) {
      return this.prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          senderType: sender.senderType,
          customerId: null,
          contactId: null,
        },
      });
    }

    return Promise.resolve(null);
  }

  private isExpenseFlowTurn(openCaseType: string | undefined, message: string): boolean {
    if (process.env.NORA_WHATSAPP_AGENT_EXPENSES !== "true") {
      return false;
    }
    // Only an EXISTING expense case routes to the agent. The first media turn
    // must go through the planner, which creates the case + queues OCR; the
    // agent has no data to register until that has happened.
    return (
      openCaseType === "expense" &&
      !this.isExplicitNonExpenseStartMessage(message)
    );
  }

  private async requestNoraAgent(payload: Record<string, unknown>) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Nora agent request failed with status ${response.status}`);
    }
    return response.json() as Promise<{
      reply_text: string;
      case_update: Record<string, unknown> | null;
      executed_entity: Record<string, unknown> | null;
    }>;
  }

  private async requestNoraGeneralAgent(payload: Record<string, unknown>) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/agent/general`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Nora general agent request failed with status ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
      );
    }
    return response.json() as Promise<{
      reply_text: string;
      case_update: Record<string, unknown> | null;
      executed_entity: Record<string, unknown> | null;
    }>;
  }

  /**
   * Que le podemos vender a este cliente y en que empaque. Sin esto el agente no
   * sabe que ASATECH viene en "Bolsa x 500 g" y toma "10 kilos" como 10 unidades.
   * Con lista de precios se muestra solo lo que esta en su lista (es lo que tiene
   * precio negociado); sin lista, el catalogo activo con el precio base.
   */
  private async catalogForCustomer(priceListId: string | null) {
    try {
      return await this.loadCatalogForCustomer(priceListId);
    } catch (error) {
      // Sin catalogo el agente sigue atendiendo (solo no sabe de empaques); que
      // esta consulta falle no puede tumbarlo al planner.
      this.logger.error(`No se pudo cargar el catalogo del cliente: ${String(error)}`);
      return [];
    }
  }

  private async loadCatalogForCustomer(priceListId: string | null) {
    const presentations = await this.prisma.productPresentation.findMany({
      where: {
        active: true,
        product: { active: true },
        ...(priceListId && { priceItems: { some: { priceListId } } }),
      },
      select: {
        empaque: true,
        product: { select: { name: true, basePrice: true } },
        ...(priceListId && {
          priceItems: {
            where: { priceListId },
            select: { priceSinIva: true },
          },
        }),
      },
      orderBy: { product: { name: "asc" } },
    });

    const byProduct = new Map<string, Array<{ empaque: string; precioSinIva: number | null }>>();
    for (const presentation of presentations) {
      const listPrice = presentation.priceItems?.[0]?.priceSinIva;
      const price = listPrice ?? presentation.product.basePrice;
      const empaques = byProduct.get(presentation.product.name) ?? [];
      empaques.push({
        empaque: presentation.empaque,
        precioSinIva: price === null || price === undefined ? null : Number(price),
      });
      byProduct.set(presentation.product.name, empaques);
    }

    return [...byProduct.entries()].map(([producto, presentaciones]) => ({
      producto,
      presentaciones,
    }));
  }

  private async buildCustomerSnapshot(customerId: string) {
    const [customer, orders, invoices] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          displayName: true,
          priceListId: true,
          customerZones: {
            where: { isActive: true },
            select: { id: true, zone: { select: { name: true } } },
          },
        },
      }),
      this.prisma.order.findMany({
        where: { customerId },
        orderBy: { orderDate: "desc" },
        take: 5,
        select: {
          orderNumber: true,
          status: true,
          orderDate: true,
          total: true,
          carrierName: true,
          trackingNumber: true,
          trackingUrl: true,
          dispatchDate: true,
          committedDeliveryDate: true,
          deliveryDate: true,
          customerZoneId: true,
          company: { select: { prefix: true } },
          items: { select: { productSnapshotSku: true, quantity: true, unitPrice: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: { customerId },
        select: { dueDate: true, totalAmount: true, totalPaid: true, creditNoteTotal: true },
      }),
    ]);

    const now = new Date();
    let saldo = 0;
    let vencidasCount = 0;
    for (const inv of invoices) {
      const balance =
        Number(inv.totalAmount) - Number(inv.totalPaid) - Number(inv.creditNoteTotal ?? 0);
      if (balance > 0) {
        saldo += balance;
        if (inv.dueDate < now) {
          vencidasCount += 1;
        }
      }
    }

    return {
      customerName: customer?.displayName ?? null,
      catalogo: await this.catalogForCustomer(customer?.priceListId ?? null),
      // Zonas de despacho del cliente: si tiene varias, Nora le pregunta a cual
      // despachar antes de armar el pedido (el asesor ya no tiene que adivinar).
      zonas: (customer?.customerZones ?? []).map((customerZone) => ({
        id: customerZone.id,
        nombre: customerZone.zone?.name ?? "",
      })),
      recentOrders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        orderDate: o.orderDate.toISOString(),
        total: Number(o.total),
        carrierName: o.carrierName ?? null,
        trackingNumber: o.trackingNumber ?? null,
        trackingUrl: o.trackingUrl ?? null,
        dispatchDate: o.dispatchDate ? o.dispatchDate.toISOString() : null,
        committedDeliveryDate: o.committedDeliveryDate ? o.committedDeliveryDate.toISOString() : null,
        deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString() : null,
        companyRef: o.company?.prefix ?? null,
        customerZoneId: o.customerZoneId ?? null,
        items: o.items.map((it) => ({
          productRef: it.productSnapshotSku,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
      })),
      cartera: { saldo, vencidasCount },
    };
  }

  private async requestNoraCustomerAgent(payload: Record<string, unknown>) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/agent/customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Nora customer agent request failed with status ${response.status}`);
    }
    return response.json() as Promise<{
      reply_text: string;
      case_update: Record<string, unknown> | null;
      executed_entity: Record<string, unknown> | null;
      handoff: { needed: boolean; reason: string | null; rol: string | null } | null;
      order_case: {
        orderRef: string | null;
        items: Array<Record<string, unknown>>;
        zona?: string | null;
        motivo: string;
      } | null;
    }>;
  }

  private async requestNoraRoute(payload: Prisma.InputJsonObject) {
    const noraApiUrl = process.env.NORA_API_URL ?? "http://localhost:8000";
    const response = await fetch(`${noraApiUrl}/whatsapp/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Nora route request failed with status ${response.status}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  private async persistIntentTag(
    conversationId: string,
    noraResponse: Record<string, unknown>,
  ) {
    try {
      const label = this.intentTagLabel(noraResponse.intent);

      if (!label) {
        return;
      }

      await this.prisma.whatsAppConversationTag.upsert({
        where: { conversationId_label: { conversationId, label } },
        update: {},
        create: { conversationId, label },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist Nora intent tag for conversation ${conversationId}: ${this.safeErrorMessage(error)}`,
      );
    }
  }

  private intentTagLabel(intentValue: unknown) {
    const intent = this.stringValue(intentValue);

    if (!intent) {
      return null;
    }

    const labelsByIntent: Record<string, string> = {
      pedido: "pedido",
      consulta_pedidos: "pedido",
      consulta_cartera: "cartera",
      soporte_pago: "cartera",
      guia_logistica: "logistica",
      gasto: "gasto",
      crear_cliente: "cliente",
      crear_visita: "agenda",
      reclamo: "reclamo",
      resumen_conversacion: "otro",
      clasificacion: "otro",
    };

    return labelsByIntent[intent] ?? "otro";
  }

  private async processCaseTransition(
    noraResponse: Record<string, unknown>,
    conversationId: string,
    message: WhatsAppMessage,
    sender: ResolvedWhatsAppSender,
  ) {
    const transition = noraResponse.case_transition;
    if (!transition || typeof transition !== "object" || Array.isArray(transition)) {
      return undefined;
    }

    const source = transition as Record<string, unknown>;
    const action = this.stringValue(source.action);
    const actorUserId = "userId" in sender ? sender.userId : null;

    if (action === "create_new_customer_subcase") {
      const caseId = this.stringValue(source.caseId);
      if (!caseId) {
        return undefined;
      }
      const orderCase = await this.prisma.noraConversationCase.findFirst({
        where: { id: caseId, conversationId },
      });
      if (!orderCase) {
        return undefined;
      }
      return this.noraCaseService.createNewCustomerSubcase(orderCase, actorUserId);
    }

    if (action === "start_case") {
      const type = this.stringValue(source.type);

      if (type === NoraConversationCaseType.new_customer) {
        const missingFields = this.stringArrayValue(source.missingFields);
        return this.noraCaseService.createCase({
          conversationId,
          type: NoraConversationCaseType.new_customer,
          status: this.newCustomerRequiredSatisfied(missingFields)
            ? NoraConversationCaseStatus.ready_for_review
            : NoraConversationCaseStatus.collecting_info,
          extractedData: this.objectValue(source.extractedData) ?? {},
          missingFields,
          proposal: {
            type: "new_customer",
            title: "Cliente nuevo",
            payload: this.objectValue(source.extractedData) ?? {},
          },
          lastQuestion: this.stringValue(source.lastQuestion) ?? null,
          riskLevel: "high",
          createdByUserId: actorUserId,
        });
      }
      if (type === NoraConversationCaseType.expense) {
        const attachment = this.caseAttachmentFromMessage(message);
        return this.noraCaseService.createCase({
          conversationId,
          type: NoraConversationCaseType.expense,
          extractedData: this.objectValue(source.extractedData) ?? {},
          missingFields: this.stringArrayValue(source.missingFields),
          attachments: attachment ? [attachment] : [],
          lastQuestion: this.stringValue(source.lastQuestion) ?? null,
          riskLevel: "medium",
          createdByUserId: actorUserId,
        });
      }
      if (type === NoraConversationCaseType.order) {
        const missingFields = this.stringArrayValue(source.missingFields);
        return this.noraCaseService.createCase({
          conversationId,
          type: NoraConversationCaseType.order,
          status:
            missingFields.length === 0
              ? NoraConversationCaseStatus.ready_for_review
              : NoraConversationCaseStatus.collecting_info,
          extractedData: this.objectValue(source.extractedData) ?? {},
          missingFields,
          lastQuestion: this.stringValue(source.lastQuestion) ?? null,
          riskLevel: "high",
          createdByUserId: actorUserId,
        });
      }
      if (type === VISIT_CASE_TYPE) {
        const missingFields = this.stringArrayValue(source.missingFields);
        return this.noraCaseService.createCase({
          conversationId,
          type: VISIT_CASE_TYPE,
          status: NoraConversationCaseStatus.collecting_info,
          extractedData: this.objectValue(source.extractedData) ?? {},
          missingFields,
          proposal: {
            type: "visit",
            title: "Visita por confirmar",
            payload: this.objectValue(source.extractedData) ?? {},
          },
          lastQuestion: this.stringValue(source.lastQuestion) ?? null,
          riskLevel: "medium",
          createdByUserId: actorUserId,
        });
      }
      return undefined;
    }

    if (action === "update_case") {
      const caseId = this.stringValue(source.caseId);
      if (!caseId) {
        return undefined;
      }
      const existingCase = await this.prisma.noraConversationCase.findFirst({
        where: { id: caseId, conversationId },
      });
      if (!existingCase) {
        return undefined;
      }
      const nextMissing = this.stringArrayValue(source.missingFields);
      return this.noraCaseService.updateCase(caseId, {
        extractedData: this.objectValue(source.extractedData) ?? {},
        missingFields: nextMissing,
        lastQuestion: this.stringValue(source.lastQuestion) ?? null,
        ...(existingCase.type === NoraConversationCaseType.order &&
          nextMissing.length === 0 && {
            status: NoraConversationCaseStatus.ready_for_review,
          }),
        ...(existingCase.type === NoraConversationCaseType.new_customer &&
          this.newCustomerRequiredSatisfied(nextMissing) && {
            status: NoraConversationCaseStatus.ready_for_review,
          }),
        ...(existingCase.type === VISIT_CASE_TYPE && {
          status: NoraConversationCaseStatus.collecting_info,
        }),
      });
    }

    return undefined;
  }

  private async processOrderCandidate(
    noraResponse: Record<string, unknown>,
    conversationId: string,
    sender: ResolvedWhatsAppSender,
  ): Promise<AutomationRoutingResult | undefined> {
    if (sender.senderType === WhatsAppSenderType.desconocido) {
      return undefined;
    }

    if (noraResponse.intent !== "pedido") {
      return undefined;
    }

    const candidate = this.extractOrderCandidate(noraResponse.order_candidate);
    if (!candidate) {
      return undefined;
    }

    if (candidate.items.length === 0) {
      return {
        decision: "needs_clarification",
        missingField: "items",
        question: "Para preparar el pedido, enviame producto y cantidad mayor a cero.",
      };
    }

    const existingAutomatedOrder = await this.findExistingAutomatedOrder(conversationId);
    if (existingAutomatedOrder) {
      return {
        decision: "human_review",
        reason: "La conversacion ya tiene un pedido creado por automatizacion de Nora.",
        existingOrder: existingAutomatedOrder,
      };
    }

    const actor = await this.automationActorFor(sender);
    if (!actor) {
      return {
        decision: "human_review",
        reason: "NORA_AUTOMATION_USER_ID no esta configurado o no corresponde a un usuario activo.",
        proposal: candidate,
      };
    }

    return this.orderAutomation.process(
      actor,
      conversationId,
      candidate,
    ) as Promise<AutomationRoutingResult>;
  }

  private extractOrderCandidate(candidate: unknown): ProcessOrderAutomationDto | undefined {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return undefined;
    }

    const source = candidate as Record<string, unknown>;
    const items = Array.isArray(source.items)
      ? source.items
          .map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return null;
            }

            const itemSource = item as Record<string, unknown>;
            const productRef = this.stringValue(itemSource.productRef);
            const quantity = Number(itemSource.quantity);

            if (!productRef || !Number.isFinite(quantity) || quantity <= 0) {
              return null;
            }

            return {
              productRef,
              quantity,
              ...(this.stringValue(itemSource.presentation) && {
                presentation: this.stringValue(itemSource.presentation),
              }),
              ...(this.stringValue(itemSource.notes) && {
                notes: this.stringValue(itemSource.notes),
              }),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
      : [];

    return {
      ...(this.stringValue(source.companyRef) && {
        companyRef: this.stringValue(source.companyRef),
      }),
      ...(this.stringValue(source.customerRef) && {
        customerRef: this.stringValue(source.customerRef),
      }),
      ...(this.stringValue(source.customerZoneId) && {
        customerZoneId: this.stringValue(source.customerZoneId),
      }),
      ...(this.stringValue(source.zoneRef) && {
        zoneRef: this.stringValue(source.zoneRef),
      }),
      items,
      ...(this.stringValue(source.deliveryInstructions) && {
        deliveryInstructions: this.stringValue(source.deliveryInstructions),
      }),
      ...(this.stringValue(source.notes) && {
        notes: this.stringValue(source.notes),
      }),
    };
  }

  private async automationActorFor(sender: ResolvedWhatsAppSender): Promise<AuthUser | null> {
    if ("userId" in sender) {
      return {
        id: sender.userId,
        email: sender.userEmail,
        role: sender.userRole,
      };
    }

    const automationUserId = process.env.NORA_AUTOMATION_USER_ID?.trim();
    if (!automationUserId) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: automationUserId },
    });

    if (!user?.active) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private async findExistingAutomatedOrder(conversationId: string) {
    const existingOrder = await this.prisma.order.findFirst({
      where: { sourceConversationId: conversationId },
      orderBy: { createdAt: "desc" },
      include: { items: true, customer: true },
    });

    if (!existingOrder) {
      return null;
    }

    const actionLogs = await this.prisma.noraActionLog.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const hasAutomationCreatedOrder = actionLogs.some((actionLog) => {
      if (!actionLog.output || typeof actionLog.output !== "object" || Array.isArray(actionLog.output)) {
        return false;
      }

      const output = actionLog.output as Record<string, unknown>;
      const automation = output.order_automation;
      return (
        automation !== null &&
        typeof automation === "object" &&
        !Array.isArray(automation) &&
        (automation as Record<string, unknown>).decision === "created"
      );
    });

    return hasAutomationCreatedOrder ? existingOrder : null;
  }

  private extractSuggestedReply(
    noraResponse: Record<string, unknown>,
    automationResult?: { reply?: unknown; question?: unknown },
  ): string | undefined {
    const automationReply =
      this.stringValue(automationResult?.reply) ?? this.stringValue(automationResult?.question);
    if (automationReply) {
      return automationReply;
    }

    const caseTransition =
      noraResponse.case_transition &&
      typeof noraResponse.case_transition === "object" &&
      !Array.isArray(noraResponse.case_transition)
        ? (noraResponse.case_transition as Record<string, unknown>)
        : null;
    const caseQuestion = this.stringValue(caseTransition?.lastQuestion);
    if (caseQuestion) {
      return caseQuestion;
    }

    const reply = noraResponse.suggested_reply;
    return this.stringValue(reply);
  }

  private shouldAutoReply(
    noraResponse: Record<string, unknown>,
    automationResult?: { decision?: unknown },
  ): boolean {
    if (
      automationResult?.decision === "created" ||
      automationResult?.decision === "needs_clarification"
    ) {
      return true;
    }

    return noraResponse.requires_human_review !== true;
  }

  private isNewCustomerStartMessage(message: string): boolean {
    const normalized = message
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    return [
      "crear cliente",
      "crear un cliente",
      "crear el cliente",
      "agregar cliente",
      "agregar un cliente",
      "nuevo cliente",
      "cliente nuevo",
      "registrar cliente",
      "registrar un cliente",
      "vamos a crearlo",
      "vamos a crear el cliente",
      "crearlo",
    ].some((phrase) => normalized.includes(phrase));
  }

  private isVisitStartMessage(message: string): boolean {
    const normalized = message
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    return [
      "crear visita",
      "crear una visita",
      "crear la visita",
      "registrar visita",
      "registrar una visita",
      "programar visita",
      "programar una visita",
      "agendar visita",
      "agendar una visita",
      "necesito visita",
      "necesito una visita",
      "quiero visita",
      "quiero una visita",
      "vamos a crear una visita",
      // Natural phrasing that describes scheduling a visit (mirrors planner._starts_visit_flow).
      "voy a visitar",
      "vamos a visitar",
      "los voy a visitar",
      "visitar a",
      "create visit",
      "create a visit",
      "register visit",
      "register a visit",
      "schedule visit",
      "schedule a visit",
      "log visit",
      "log a visit",
    ].some((phrase) => normalized.includes(phrase));
  }

  private isVisitDeleteMessage(message: string): boolean {
    const normalized = message
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    return [
      "eliminar visita",
      "eliminar una visita",
      "eliminar la visita",
      "borrar visita",
      "borrar una visita",
      "borrar la visita",
      "elimina la visita",
      "elimina visita",
      "borra la visita",
      "borra visita",
      "delete visit",
      "delete a visit",
      "remove visit",
    ].some((phrase) => normalized.includes(phrase));
  }

  private isEntityEditMessage(message: string): boolean {
    const normalized = message
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    const verbs = [
      "editar",
      "edita",
      "modificar",
      "modifica",
      "actualizar",
      "actualiza",
      "cambiar",
      "cambia",
      "corregir",
      "corrige",
      "reagendar",
      "reagenda",
      "edit ",
      "update ",
    ];
    // AI-02: opportunity/stage messages must also reach the general agent (it
    // owns update_opportunity_stage). "oportunidad"/"etapa" are routable
    // entities, and stage-change verbs like "mover/pasar/avanzar" count too.
    const entities = ["visita", "cliente", "gasto", "oportunidad", "etapa"];
    const stageVerbs = ["mover", "mueve", "pasar", "pasa", "avanzar", "avanza"];
    // AI-03/04: a customer field edit ("cambia el NIT de Ferretería a 900...",
    // "actualiza el teléfono de...") rarely says the literal word "cliente".
    // Route on the customer-field intent so it reaches update_customer.
    const customerFieldTokens = [
      "nit",
      "telefono",
      "celular",
      "correo",
      "email",
      "direccion",
    ];
    const hasVerb = verbs.some((verb) => normalized.includes(verb));
    const hasEntity = entities.some((entity) => normalized.includes(entity));
    const hasStageVerb = stageVerbs.some((verb) => normalized.includes(verb));
    const hasCustomerField = customerFieldTokens.some((token) =>
      normalized.includes(token),
    );
    return (
      (hasVerb && hasEntity) ||
      (hasStageVerb && normalized.includes("oportunidad")) ||
      (hasVerb && hasCustomerField)
    );
  }

  // AI-05: a new-customer case is ready once every REQUIRED field is present,
  // even if optional fields (email/address/department/notes) are still missing.
  private newCustomerRequiredSatisfied(missingFields: string[]): boolean {
    return NoraRoutingService.NEW_CUSTOMER_REQUIRED_FIELDS.every(
      (field) => !missingFields.includes(field),
    );
  }

  private isExplicitNonExpenseStartMessage(message: string): boolean {
    return (
      this.isNewCustomerStartMessage(message) ||
      this.isVisitStartMessage(message) ||
      this.isVisitDeleteMessage(message) ||
      this.isEntityEditMessage(message)
    );
  }

  private stringValue(value: unknown) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private stringArrayValue(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private isStartExpenseTransition(noraResponse: Record<string, unknown>): boolean {
    const transition = noraResponse.case_transition;
    if (!transition || typeof transition !== "object" || Array.isArray(transition)) {
      return false;
    }
    const source = transition as Record<string, unknown>;
    return source.action === "start_case" && source.type === NoraConversationCaseType.expense;
  }

  private openCasePayload(openCase: NoraConversationCase) {
    return {
      id: openCase.id,
      type: openCase.type,
      status: openCase.status,
      extractedData: openCase.extractedData,
      missingFields: Array.isArray(openCase.missingFields) ? openCase.missingFields : [],
      lastQuestion: openCase.lastQuestion,
    };
  }

  private mediaPayloadFromMessage(message: WhatsAppMessage):
    | {
        kind: "image" | "document";
        providerMediaId?: string;
        fileName?: string;
        contentType?: string;
        caption?: string;
      }
    | undefined {
    const payload =
      message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
        ? (message.payload as Record<string, unknown>)
        : {};
    const mediaKind = this.stringValue(payload.mediaKind);
    const kind =
      mediaKind === "image" || message.body === "[Imagen]"
        ? "image"
        : mediaKind === "document" || message.body === "[Documento]"
          ? "document"
          : null;

    if (!kind) {
      return undefined;
    }

    return {
      kind,
      providerMediaId: this.stringValue(payload.mediaId) ?? this.stringValue(payload.id),
      fileName: this.stringValue(payload.fileName),
      contentType: this.stringValue(payload.contentType),
      caption: this.stringValue(payload.caption),
    };
  }

  private caseAttachmentFromMessage(message: WhatsAppMessage): NoraCaseAttachment | undefined {
    const mediaPayload = this.mediaPayloadFromMessage(message);
    if (!mediaPayload) {
      return undefined;
    }
    const payload =
      message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
        ? (message.payload as Record<string, unknown>)
        : {};

    return {
      messageId: message.id,
      kind: mediaPayload.kind,
      provider: "kapso",
      ...(mediaPayload.providerMediaId && { providerMediaId: mediaPayload.providerMediaId }),
      ...(mediaPayload.fileName && { fileName: mediaPayload.fileName }),
      ...(mediaPayload.contentType && { contentType: mediaPayload.contentType }),
      ...(mediaPayload.caption && { caption: mediaPayload.caption }),
      payload,
    };
  }

  private toJsonSafeValue(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private safeErrorMessage(error: unknown) {
    return error instanceof Error && error.message
      ? error.message
      : "Nora route request failed";
  }
}
