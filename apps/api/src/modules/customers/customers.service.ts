import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { PrismaService } from "../../prisma/prisma.service";
import { AssignZoneDto } from "./dto/assign-zone.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { UpdateCustomerZoneDto } from "./dto/update-customer-zone.dto";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateCustomerDto) {
    this.assertExactlyOnePrimaryContact(dto);
    await this.assertValidReferences(dto);

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
            notes: dto.notes,
            segmentId: dto.segmentId,
            // TODO(cliente-empresa): el brief de Task 1 no cubre este sitio; se
            // hardcodea el default del sistema hasta que una tarea futura
            // agregue selección de empresa al DTO/UI de creación de clientes.
            companyId: "clx_default_norgtech",
            assignedToUserId: dto.assignedToUserId,
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

        return customer;
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Ya existe un cliente con ese NIT (taxId)");
      }

      throw error;
    }
  }

  private async assertValidReferences(dto: CreateCustomerDto) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: dto.segmentId },
    });

    if (!segment) {
      throw new NotFoundException("Customer segment not found");
    }

    if (!dto.assignedToUserId) {
      return;
    }

    const assignedUser = await this.prisma.user.findUnique({
      where: { id: dto.assignedToUserId },
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
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.segmentId !== undefined && { segmentId: dto.segmentId }),
          ...(dto.assignedToUserId !== undefined && {
            assignedToUserId: dto.assignedToUserId,
          }),
          ...(dto.customerType !== undefined && { customerType: dto.customerType }),
          ...(dto.creditLimit !== undefined && { creditLimit: dto.creditLimit }),
          ...(dto.paymentCondition !== undefined && { paymentCondition: dto.paymentCondition }),
          ...(dto.paymentDays !== undefined && { paymentDays: dto.paymentDays }),
          ...(dto.purchaseBudget !== undefined && { purchaseBudget: dto.purchaseBudget }),
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

      return result;
    });

    return updated;
  }

  findAll(includeInactive = false) {
    return this.prisma.customer.findMany({
      where: includeInactive ? undefined : { active: true },
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
        active: true,
        segment: { select: { id: true, name: true } },
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

  async refreshSegments(user: AuthUser) {
    const segments = await this.prisma.customerSegment.findMany({
      where: { active: true },
      orderBy: { minGoalAmount: "asc" },
    });

    const customers = await this.prisma.customer.findMany({
      where: { active: true },
      include: { segment: true },
    });

    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    const details: Array<{
      customerId: string;
      customerName: string;
      previousSegment: string;
      newSegment: string;
      annualSpend: number;
    }> = [];

    let updatedCount = 0;

    for (const customer of customers) {
      const aggregate = await this.prisma.order.aggregate({
        where: {
          customerId: customer.id,
          status: { in: ["facturado", "entregado"] },
          createdAt: { gte: oneYearAgo },
        },
        _sum: { total: true },
      });

      const totalCompras = aggregate._sum.total ?? new Prisma.Decimal(0);

      const newSegment = segments.find((segment) => {
        const min = new Prisma.Decimal(segment.minGoalAmount);
        const max = segment.maxGoalAmount ? new Prisma.Decimal(segment.maxGoalAmount) : null;
        const total = new Prisma.Decimal(totalCompras);
        return total.gte(min) && (max === null || total.lt(max));
      });

      const newSegmentId = newSegment?.id ?? segments[0]?.id;

      if (newSegmentId && newSegmentId !== customer.segmentId) {
        await this.prisma.$transaction(async (tx) => {
          await tx.customer.update({
            where: { id: customer.id },
            data: { segmentId: newSegmentId, updatedBy: user.id },
          });

          await this.auditService.record(
            {
              entityType: "Customer",
              entityId: customer.id,
              action: "customer.segment_changed",
              actorUserId: user.id,
              previousState: {
                segmentId: customer.segmentId,
                segmentName: customer.segment?.name,
              },
              nextState: {
                segmentId: newSegmentId,
                segmentName: newSegment?.name,
              },
            },
            tx,
          );
        });

        updatedCount++;

        if (details.length < 50) {
          details.push({
            customerId: customer.id,
            customerName: customer.displayName,
            previousSegment: customer.segment?.name ?? "",
            newSegment: newSegment?.name ?? "",
            annualSpend: new Prisma.Decimal(totalCompras).toNumber(),
          });
        }
      }
    }

    return {
      totalCustomers: customers.length,
      updated: updatedCount,
      details,
    };
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
