import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import {
  computeInvoiceStatus,
  invoiceBalance,
} from "../invoices/invoice-constants";
import { CreateReturnDto } from "./dto/create-return.dto";
import { ListReturnsDto } from "./dto/list-returns.dto";

const includeReturnRelations = {
  customer: { select: { id: true, displayName: true } },
  order: { select: { id: true, orderNumber: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
} satisfies Prisma.ReturnInclude;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateReturnDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException("Customer not found");

    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.customerId !== dto.customerId) {
        throw new BadRequestException("Order does not belong to customer");
      }
    }

    const amount = new Prisma.Decimal(dto.amount);

    let invoice: Prisma.InvoiceGetPayload<true> | null = null;
    if (dto.invoiceId) {
      invoice = await this.prisma.invoice.findUnique({
        where: { id: dto.invoiceId },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.customerId !== dto.customerId) {
        throw new BadRequestException("Invoice does not belong to customer");
      }
      // ponytail: credit note caps at the outstanding balance; refunds on
      // already-settled invoices aren't modeled. Add a credit-balance flow if needed.
      const outstanding = invoiceBalance(
        invoice.totalAmount,
        invoice.totalPaid,
        invoice.creditNoteTotal,
      );
      if (amount.gt(outstanding)) {
        throw new BadRequestException(
          "Return amount exceeds invoice outstanding balance",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.return.create({
        data: {
          customerId: dto.customerId,
          orderId: dto.orderId || null,
          invoiceId: dto.invoiceId || null,
          returnDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
          amount,
          reason: dto.reason,
          notes: dto.notes || null,
          createdBy: user.id,
        },
        include: includeReturnRelations,
      });

      if (invoice) {
        const newCreditNoteTotal = new Prisma.Decimal(invoice.creditNoteTotal).plus(amount);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            creditNoteTotal: newCreditNoteTotal,
            status: computeInvoiceStatus(
              invoice.status,
              invoice.totalAmount,
              invoice.totalPaid,
              newCreditNoteTotal,
            ),
            updatedBy: user.id,
          },
        });
      }

      await this.auditService.record(
        {
          entityType: "Return",
          entityId: created.id,
          action: "return.created",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(created)),
        },
        tx,
      );

      return created;
    });
  }

  findAll(user: AuthUser, filters: ListReturnsDto) {
    const where: Prisma.ReturnWhereInput = {};

    if (user.role === UserRole.comercial) {
      where.customer = { assignedToUserId: user.id };
    }
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;
    if (filters.from || filters.to) {
      where.returnDate = {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined,
      };
    }

    return this.prisma.return.findMany({
      where,
      orderBy: { returnDate: "desc" },
      include: includeReturnRelations,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const found = await this.prisma.return.findUnique({
      where: { id },
      include: includeReturnRelations,
    });
    if (!found) throw new NotFoundException("Return not found");
    return found;
  }
}
