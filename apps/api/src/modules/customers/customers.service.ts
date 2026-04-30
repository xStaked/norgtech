import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateCustomerDto) {
    this.assertExactlyOnePrimaryContact(dto);
    await this.assertValidReferences(dto);

    return this.prisma.$transaction(async (tx) => {
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
          assignedToUserId: dto.assignedToUserId,
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

  findAll() {
    return this.prisma.customer.findMany({
      include: { contacts: true, segment: true },
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

  private assertExactlyOnePrimaryContact(dto: CreateCustomerDto) {
    const primaryContacts = dto.contacts.filter((contact) => contact.isPrimary);

    if (primaryContacts.length !== 1) {
      throw new BadRequestException(
        "Customer must include exactly one primary contact",
      );
    }
  }
}
