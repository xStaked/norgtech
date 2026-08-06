import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CustomerType, NotificationType, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";
import { taxIdSearchVariants } from "../../common/tax-id";
import { AssignZoneDto } from "./dto/assign-zone.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { ListCustomersQueryDto } from "./dto/list-customers.query.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { UpdateCustomerZoneDto } from "./dto/update-customer-zone.dto";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: AuthUser, dto: CreateCustomerDto) {
    this.assertExactlyOnePrimaryContact(dto);
    // Repartir cartera es de direccion. Un comercial se queda el cliente que
    // crea el mismo y nada mas, mande lo que mande el formulario (o Nora en su
    // nombre): sin esto podia dar de alta un cliente a nombre de un companero.
    // Se resuelve ANTES de validar para no rechazar por un vendedor inexistente
    // que de todas formas se iba a ignorar.
    const assignedToUserId =
      user.role === "comercial" ? user.id : dto.assignedToUserId;
    await this.assertValidReferences(dto, assignedToUserId);
    const segmentId = await this.resolveSegmentId(dto.segmentId, dto.customerType);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            legalName: dto.legalName,
            displayName: dto.displayName,
            taxId: dto.taxId,
            phone: dto.phone,
            email: dto.email,
            address: dto.address,
            city: dto.city,
            department: dto.department,
            country: dto.country,
            priceListId: dto.priceListId,
            notes: dto.notes,
            segmentId,
            companyId: dto.companyId,
            assignedToUserId,
            customerType: dto.customerType || undefined,
            creditLimit: dto.creditLimit !== undefined ? dto.creditLimit : undefined,
            paymentCondition: dto.paymentCondition || undefined,
            paymentDays: dto.paymentDays !== undefined ? dto.paymentDays : undefined,
            purchaseBudget: dto.purchaseBudget !== undefined ? dto.purchaseBudget : undefined,
            createdBy: user.id,
            updatedBy: user.id,
            contacts: {
              create: dto.contacts.map((contact) => ({
                fullName: contact.fullName,
                roleTitle: contact.roleTitle,
                phone: contact.phone,
                email: contact.email,
                isPrimary: contact.isPrimary,
                notes: contact.notes,
                createdBy: user.id,
                updatedBy: user.id,
              })),
            },
          },
          include: { contacts: true },
        });

        if (dto.initialGoal) {
          await tx.customerGoal.create({
            data: {
              customerId: customer.id,
              periodType: dto.initialGoal.periodType,
              periodValue: dto.initialGoal.periodValue,
              targetAmount: dto.initialGoal.targetAmount,
              notes: dto.initialGoal.notes || null,
              createdBy: user.id,
              updatedBy: user.id,
            },
          });
        }

        await this.auditService.record(
          {
            entityType: "Customer",
            entityId: customer.id,
            action: "customer.created",
            actorUserId: user.id,
            nextState: JSON.parse(JSON.stringify(customer)),
          },
          tx,
        );

        // Avisarle a alguien que se asigno a si mismo el cliente que acaba de
        // crear es ruido: la notificacion es para el que la recibe de direccion.
        if (assignedToUserId && assignedToUserId !== user.id) {
          await this.notifications.emit(
            {
              userIds: [assignedToUserId],
              type: NotificationType.cliente_asignado,
              title: `Te asignaron el cliente ${customer.displayName}`,
              entityType: "customer",
              entityId: customer.id,
            },
            tx,
          );
        }

        return customer;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        // El NIT es unico global e ignora `active`, mientras que el listado
        // esconde los inactivos: sin decir QUE cliente choca, el que busco y no
        // lo encontro recibe un "ya existe" que parece contradictorio.
        const existing = dto.taxId
          ? await this.prisma.customer.findUnique({
              where: { taxId: dto.taxId },
              select: { id: true, displayName: true, active: true },
            })
          : null;

        throw new ConflictException(
          existing
            ? `Ya existe un cliente con el NIT ${dto.taxId}: "${existing.displayName}" (id ${existing.id})` +
              (existing.active
                ? ". Búscalo por NIT en vez de crearlo."
                : ", pero está INACTIVO. Hay que reactivarlo en vez de crear uno nuevo.")
            : "Ya existe un cliente con ese NIT (taxId)",
        );
      }

      throw error;
    }
  }

  /**
   * El segmento ya no se pide ni se muestra: es una etiqueta, Distribuidor o
   * Directo, y sale de `customerType`, que es lo que el usuario si edita. El
   * modelo sigue en pie por si algun dia vuelven los niveles.
   */
  private async resolveSegmentId(segmentId?: string, customerType?: CustomerType | null) {
    if (segmentId) {
      const segment = await this.prisma.customerSegment.findUnique({
        where: { id: segmentId },
      });
      if (!segment) {
        throw new NotFoundException("Customer segment not found");
      }
      return segmentId;
    }

    const name = customerType === "distribuidor" ? "Distribuidor" : "Directo";
    const segments = await this.prisma.customerSegment.findMany({
      where: { active: true },
    });
    const fallback = segments.find((s) => s.name === name) ?? segments[0];

    if (!fallback) {
      throw new NotFoundException("No hay segmentos de cliente configurados");
    }

    return fallback.id;
  }

  private async assertValidReferences(
    dto: CreateCustomerDto,
    assignedToUserId?: string,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });

    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }

    if (!assignedToUserId) {
      return;
    }

    const assignedUser = await this.prisma.user.findUnique({
      where: { id: assignedToUserId },
    });

    if (!assignedUser) {
      throw new NotFoundException("Assigned user not found");
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    if (dto.segmentId) {
      const segment = await this.prisma.customerSegment.findUnique({
        where: { id: dto.segmentId },
      });
      if (!segment) {
        throw new NotFoundException("Customer segment not found");
      }
    }

    if (dto.assignedToUserId) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: dto.assignedToUserId },
      });
      if (!assignedUser) {
        throw new NotFoundException("Assigned user not found");
      }
    }

    // Un comercial no reparte cartera, ni siquiera hacia si mismo: se queda
    // unicamente los clientes que crea el (ver `create`). Sin esto puede
    // reasignarse por PATCH el cliente de un companero, o tomar uno huerfano.
    if (user.role === "comercial" && dto.assignedToUserId !== undefined) {
      throw new ForbiddenException(
        "Solo un administrador o el director comercial puede asignar el vendedor de un cliente",
      );
    }

    // Activar o desactivar tampoco: reactivar era la otra puerta para quedarse
    // un cliente (antes el que reactivaba uno sin vendedor se lo llevaba). Nora
    // ahora reporta que el cliente existe inactivo y direccion decide.
    if (user.role === "comercial" && dto.active !== undefined) {
      throw new ForbiddenException(
        "Solo un administrador o el director comercial puede activar o desactivar un cliente",
      );
    }

    if (dto.companyId && dto.companyId !== customer.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: dto.companyId },
      });

      if (!company || !company.isActive) {
        throw new NotFoundException("Company not found or inactive");
      }

      // Cambiar de empresa dejaria ordenes o facturas sueltas cuya empresa ya
      // no coincide con la del cliente, que es justo lo que validan
      // OrdersService.create e InvoicesService.create.
      const [orderCount, invoiceCount] = await Promise.all([
        this.prisma.order.count({ where: { customerId: id } }),
        this.prisma.invoice.count({ where: { customerId: id } }),
      ]);

      if (orderCount > 0 || invoiceCount > 0) {
        throw new BadRequestException(
          "Cannot change company for a customer with orders or invoices",
        );
      }
    }

    // El segmento es el espejo de customerType (la etiqueta Distribuidor /
    // Directo): si cambia el tipo y nadie mando un segmento explicito, se mueve
    // con el en vez de quedarse en el que tenia.
    const segmentId =
      dto.segmentId ??
      (dto.customerType !== undefined && dto.customerType !== customer.customerType
        ? await this.resolveSegmentId(undefined, dto.customerType)
        : undefined);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.customer.update({
        where: { id },
        data: {
          ...(dto.legalName !== undefined && { legalName: dto.legalName }),
          ...(dto.displayName !== undefined && { displayName: dto.displayName }),
          ...(dto.taxId !== undefined && { taxId: dto.taxId }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.department !== undefined && { department: dto.department }),
          ...(dto.country !== undefined && { country: dto.country }),
          ...(dto.priceListId !== undefined && { priceListId: dto.priceListId }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(segmentId !== undefined && { segmentId }),
          ...(dto.companyId !== undefined && { companyId: dto.companyId }),
          ...(dto.assignedToUserId !== undefined && {
            assignedToUserId: dto.assignedToUserId,
          }),
          ...(dto.customerType !== undefined && { customerType: dto.customerType }),
          ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
          ...(dto.paymentCondition !== undefined && { paymentCondition: dto.paymentCondition }),
          ...(dto.paymentDays !== undefined && { paymentDays: dto.paymentDays }),
          ...(dto.purchaseBudget !== undefined && { purchaseBudget: dto.purchaseBudget }),
          ...(dto.active !== undefined && { active: dto.active }),
          updatedBy: user.id,
        },
        include: { contacts: true },
      });

      await this.auditService.record(
        {
          entityType: "Customer",
          entityId: id,
          action: "customer.updated",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(customer)),
          nextState: JSON.parse(JSON.stringify(result)),
        },
        tx,
      );

      // "cambio", no "es": reguardar el cliente con el mismo responsable no
      // debe re-notificar. Y sin discriminante en el dedupeKey: una sola
      // notificacion por (usuario, cliente) para siempre.
      if (
        dto.assignedToUserId &&
        dto.assignedToUserId !== customer.assignedToUserId
      ) {
        await this.notifications.emit(
          {
            userIds: [dto.assignedToUserId],
            type: NotificationType.cliente_asignado,
            title: `Te asignaron el cliente ${result.displayName}`,
            entityType: "customer",
            entityId: id,
          },
          tx,
        );
      }

      return result;
    });

    return updated;
  }

  findAll(query: ListCustomersQueryDto = {}) {
    const {
      includeInactive,
      search,
      companyId,
      segmentId,
      paymentCondition,
      customerType,
      active,
      assignedToUserId,
    } = query;

    const where: Prisma.CustomerWhereInput = {};
    if (active !== undefined) {
      where.active = active;
    } else if (!includeInactive) {
      where.active = true;
    }
    if (companyId) where.companyId = companyId;
    if (segmentId) where.segmentId = segmentId;
    if (assignedToUserId) where.assignedToUserId = assignedToUserId;
    if (paymentCondition) where.paymentCondition = paymentCondition;
    if (customerType) where.customerType = customerType;
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { legalName: { contains: search, mode: "insensitive" } },
        { taxId: { contains: search, mode: "insensitive" } },
        ...taxIdSearchVariants(search).map((variant) => ({
          taxId: { contains: variant, mode: "insensitive" as const },
        })),
      ];
    }

    return this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        legalName: true,
        displayName: true,
        taxId: true,
        phone: true,
        email: true,
        city: true,
        department: true,
        creditLimit: true,
        paymentCondition: true,
        paymentDays: true,
        customerType: true,
        active: true,
        // Lo usa el filtro por cliente del catalogo: sin lista no hay precios.
        priceListId: true,
        segment: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        assignedToUser: { select: { id: true, name: true } },
        contacts: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            isPrimary: true,
          },
        },
      },
      orderBy: { displayName: "asc" },
    });
  }

  findOne(id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: {
        segment: true,
        company: true,
        // La lista determina a qué precio se le cotiza; el detalle la muestra.
        priceList: true,
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        },
        opportunities: {
          orderBy: { createdAt: "desc" },
        },
        visits: {
          orderBy: { scheduledAt: "desc" },
        },
        followUpTasks: {
          orderBy: { dueAt: "asc" },
        },
        quotes: {
          orderBy: { createdAt: "desc" },
          include: { items: true },
        },
        orders: {
          orderBy: { createdAt: "desc" },
          include: { items: true },
        },
        billingRequests: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  async getCustomerZones(customerId: string) {
    return this.prisma.customerZone.findMany({
      where: { customerId, isActive: true },
      include: { zone: true, assignedTo: { select: { id: true, name: true } } },
      orderBy: { zone: { name: "asc" } },
    });
  }

  async assignZoneToCustomer(customerId: string, dto: AssignZoneDto) {
    await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    await this.prisma.zone.findUniqueOrThrow({ where: { id: dto.zoneId } });

    const existing = await this.prisma.customerZone.findUnique({
      where: { customerId_zoneId: { customerId, zoneId: dto.zoneId } },
    });
    if (existing) {
      if (existing.isActive) throw new BadRequestException("Zone already assigned to customer");
      return this.prisma.customerZone.update({
        where: { id: existing.id },
        data: { isActive: true, address: dto.address, assignedToUserId: dto.assignedToUserId },
        include: { zone: true, assignedTo: { select: { id: true, name: true } } },
      });
    }

    return this.prisma.customerZone.create({
      data: {
        customerId,
        zoneId: dto.zoneId,
        address: dto.address,
        assignedToUserId: dto.assignedToUserId,
      },
      include: { zone: true, assignedTo: { select: { id: true, name: true } } },
    });
  }

  async updateCustomerZone(customerId: string, customerZoneId: string, dto: UpdateCustomerZoneDto) {
    const cz = await this.prisma.customerZone.findUnique({ where: { id: customerZoneId } });
    if (!cz || cz.customerId !== customerId) {
      throw new NotFoundException("Customer zone assignment not found");
    }
    return this.prisma.customerZone.update({
      where: { id: customerZoneId },
      data: dto,
      include: { zone: true, assignedTo: { select: { id: true, name: true } } },
    });
  }

  async removeCustomerZone(customerId: string, customerZoneId: string) {
    const cz = await this.prisma.customerZone.findUnique({ where: { id: customerZoneId } });
    if (!cz || cz.customerId !== customerId) {
      throw new NotFoundException("Customer zone assignment not found");
    }
    return this.prisma.customerZone.update({
      where: { id: customerZoneId },
      data: { isActive: false },
    });
  }

  private assertExactlyOnePrimaryContact(dto: CreateCustomerDto) {
    const primaryContacts = dto.contacts.filter((contact) => contact.isPrimary);

    if (primaryContacts.length !== 1) {
      throw new BadRequestException(
        "Customer must include exactly one primary contact",
      );
    }
  }

  private isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
