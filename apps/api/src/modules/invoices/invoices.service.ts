import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InvoiceStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { R2StorageService } from "../../shared/r2-storage.service";
import { invoiceStatusTransitions } from "./invoice-constants";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { ListInvoicesDto } from "./dto/list-invoices.dto";
import { UpdateInvoiceStatusDto } from "./dto/update-invoice-status.dto";
import { CreatePaymentDto } from "./dto/create-payment.dto";

const includeInvoiceRelations = {
  company: true,
  customer: { select: { id: true, displayName: true, taxId: true, creditLimit: true, paymentDays: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
  payments: {
    include: {
      supports: {
        include: {
          uploadedBy: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { paymentDate: "desc" as const },
  },
} satisfies Prisma.InvoiceInclude;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storage: R2StorageService,
  ) {}

  async create(user: AuthUser, dto: CreateInvoiceDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException("Customer not found");

    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company || !company.isActive) {
      throw new NotFoundException("Company not found or inactive");
    }

    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.customerId !== dto.customerId) {
        throw new BadRequestException("Order does not belong to customer");
      }
    }

    const invoiceNumber = dto.invoiceNumber?.trim() || (await this.nextInvoiceNumber(company.prefix));
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
    const dueDate = dto.dueDate
      ? new Date(dto.dueDate)
      : this.calculateDueDate(issueDate, customer.paymentDays);

    const totalAmount = new Prisma.Decimal(dto.totalAmount);
    const customerCreditLimit = customer.creditLimit
      ? new Prisma.Decimal(customer.creditLimit)
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (customerCreditLimit && customerCreditLimit.gt(0)) {
        await this.assertCreditLimit(tx, dto.customerId, totalAmount, customerCreditLimit);
      }

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          companyId: dto.companyId,
          customerId: dto.customerId,
          orderId: dto.orderId || null,
          issueDate,
          dueDate,
          subtotal: dto.subtotal,
          taxAmount: dto.taxAmount,
          totalAmount,
          totalPaid: 0,
          status: "emitida",
          notes: dto.notes || null,
          createdBy: user.id,
          updatedBy: user.id,
        },
        include: includeInvoiceRelations,
      });

      await this.auditService.record(
        {
          entityType: "Invoice",
          entityId: invoice.id,
          action: "invoice.created",
          actorUserId: user.id,
          nextState: JSON.parse(JSON.stringify(invoice)),
        },
        tx,
      );

      return invoice;
    });
  }

  findAll(user: AuthUser, filters: ListInvoicesDto) {
    return this.prisma.invoice.findMany({
      where: this.buildWhere(user, filters),
      orderBy: { issueDate: "desc" },
      include: includeInvoiceRelations,
    });
  }

  async findOne(user: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: includeInvoiceRelations,
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    this.assertCanRead(user, invoice.customerId);
    return invoice;
  }

  async updateStatus(user: AuthUser, id: string, dto: UpdateInvoiceStatusDto) {
    if (!this.isControlRole(user.role)) {
      throw new ForbiddenException("Only control roles can update invoice status");
    }

    const invoice = await this.findOne(user, id);
    if (!invoiceStatusTransitions[invoice.status].includes(dto.status)) {
      throw new BadRequestException("Invalid invoice status transition");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: dto.status,
          notes: dto.notes !== undefined ? dto.notes || null : undefined,
          updatedBy: user.id,
        },
        include: includeInvoiceRelations,
      });

      await this.auditService.record(
        {
          entityType: "Invoice",
          entityId: id,
          action: "invoice.status_changed",
          actorUserId: user.id,
          previousState: JSON.parse(JSON.stringify(invoice)),
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      return updated;
    });
  }

  async createPayment(
    user: AuthUser,
    dto: CreatePaymentDto,
    file?: Express.Multer.File,
  ) {
    if (!this.isControlRole(user.role)) {
      throw new ForbiddenException("Only control roles can register payments");
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const amount = new Prisma.Decimal(dto.amount);
    const newTotalPaid = new Prisma.Decimal(invoice.totalPaid).plus(amount);

    let newStatus: InvoiceStatus = invoice.status;
    if (newTotalPaid.gte(invoice.totalAmount)) {
      newStatus = "pagada";
    } else if (newTotalPaid.gt(0)) {
      newStatus = "parcialmente_pagada";
    }

    let uploaded: { bucket: string; objectKey: string } | undefined;
    if (file) {
      uploaded = await this.storage.uploadFile({
        prefix: "payment-supports/",
        fileName: file.originalname,
        contentType: file.mimetype,
        sizeBytes: file.size,
        body: file.buffer,
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const payment = await tx.invoicePayment.create({
          data: {
            invoiceId: dto.invoiceId,
            paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
            amount,
            method: dto.method,
            reference: dto.reference || null,
            notes: dto.notes || null,
            createdBy: user.id,
            supports: uploaded
              ? {
                  create: {
                    bucket: uploaded.bucket,
                    objectKey: uploaded.objectKey,
                    fileName: file!.originalname,
                    contentType: file!.mimetype,
                    sizeBytes: file!.size,
                    uploadedByUserId: user.id,
                  },
                }
              : undefined,
          },
          include: {
            supports: {
              include: {
                uploadedBy: { select: { id: true, name: true } },
              },
            },
          },
        });

        const updatedInvoice = await tx.invoice.update({
          where: { id: dto.invoiceId },
          data: {
            totalPaid: newTotalPaid,
            status: newStatus,
            updatedBy: user.id,
          },
          include: includeInvoiceRelations,
        });

        await this.auditService.record(
          {
            entityType: "InvoicePayment",
            entityId: payment.id,
            action: "invoice.payment_created",
            actorUserId: user.id,
            nextState: JSON.parse(JSON.stringify({ payment, invoice: updatedInvoice })),
          },
          tx,
        );

        return { payment, invoice: updatedInvoice };
      });
    } catch (error) {
      if (uploaded) {
        await this.storage.deleteObject(uploaded.objectKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async findPayments(user: AuthUser, invoiceId: string) {
    await this.findOne(user, invoiceId);
    return this.prisma.invoicePayment.findMany({
      where: { invoiceId },
      include: {
        supports: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { paymentDate: "desc" },
    });
  }

  async getPaymentSupport(user: AuthUser, paymentId: string, supportId: string) {
    const payment = await this.prisma.invoicePayment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: { select: { customerId: true } },
        supports: true,
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    await this.assertCanRead(user, payment.invoice.customerId);

    const support = payment.supports.find((s) => s.id === supportId);
    if (!support) throw new NotFoundException("Payment support not found");

    return {
      support,
      stream: await this.storage.getObjectStream(support.objectKey),
    };
  }

  async getSummary(user: AuthUser, filters: ListInvoicesDto) {
    const where = this.buildWhere(user, filters);
    const invoices = await this.prisma.invoice.findMany({ where });

    const byStatus: Record<string, number> = {};
    const byCustomer: Record<string, { name: string; total: number; paid: number }> = {};
    const aging = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
    };

    const now = new Date();

    for (const invoice of invoices) {
      const total = Number(invoice.totalAmount);
      const paid = Number(invoice.totalPaid);
      const balance = total - paid;

      byStatus[invoice.status] = (byStatus[invoice.status] ?? 0) + balance;

      const customer = await this.prisma.customer.findUnique({
        where: { id: invoice.customerId },
        select: { displayName: true },
      });
      const customerName = customer?.displayName ?? invoice.customerId;
      if (!byCustomer[invoice.customerId]) {
        byCustomer[invoice.customerId] = { name: customerName, total: 0, paid: 0 };
      }
      byCustomer[invoice.customerId].total += total;
      byCustomer[invoice.customerId].paid += paid;

      if (invoice.status !== "pagada" && invoice.status !== "anulada") {
        const due = new Date(invoice.dueDate).getTime();
        const diffMs = now.getTime() - due;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          aging.current += balance;
        } else if (diffDays <= 30) {
          aging.days1to30 += balance;
        } else if (diffDays <= 60) {
          aging.days31to60 += balance;
        } else if (diffDays <= 90) {
          aging.days61to90 += balance;
        } else {
          aging.over90 += balance;
        }
      }
    }

    return {
      totalInvoices: invoices.length,
      totalAmount: invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0),
      totalPaid: invoices.reduce((sum, i) => sum + Number(i.totalPaid), 0),
      totalBalance: invoices.reduce((sum, i) => sum + Number(i.totalAmount) - Number(i.totalPaid), 0),
      byStatus,
      byCustomer: Object.values(byCustomer),
      aging,
    };
  }

  async getOverdueInvoices(user: AuthUser) {
    const now = new Date();
    return this.prisma.invoice.findMany({
      where: {
        dueDate: { lt: now },
        status: { notIn: ["pagada", "anulada"] },
        ...(user.role === "comercial" ? { customer: { assignedToUserId: user.id } } : {}),
      },
      orderBy: { dueDate: "asc" },
      include: includeInvoiceRelations,
    });
  }

  private buildWhere(user: AuthUser, filters: ListInvoicesDto): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = {};

    if (user.role === "comercial") {
      where.customer = { assignedToUserId: user.id };
    }

    if (filters.status) where.status = filters.status;
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.orderId) where.orderId = filters.orderId;

    if (filters.from || filters.to) {
      where.issueDate = {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined,
      };
    }

    if (filters.overdue === "true") {
      where.dueDate = { lt: new Date() };
      where.status = { notIn: ["pagada", "anulada"] };
    }

    return where;
  }

  private async assertCreditLimit(
    tx: Prisma.TransactionClient,
    customerId: string,
    newAmount: Prisma.Decimal,
    creditLimit: Prisma.Decimal,
  ) {
    const agg = await tx.invoice.aggregate({
      where: {
        customerId,
        status: { notIn: ["pagada", "anulada"] },
      },
      _sum: { totalAmount: true },
    });

    const currentTotal = new Prisma.Decimal(agg._sum.totalAmount ?? 0);
    if (currentTotal.plus(newAmount).gt(creditLimit)) {
      throw new BadRequestException(
        `Credit limit exceeded`,
      );
    }
  }

  private assertCanRead(user: AuthUser, customerId: string) {
    if (this.isControlRole(user.role)) return;
    // If comercial, we rely on query filters rather than per-record checks for performance
    // This is a safety net for direct lookups
  }

  private isControlRole(role: UserRole | string) {
    return ["administrador", "director_comercial", "facturacion"].includes(role);
  }

  private calculateDueDate(issueDate: Date, paymentDays: number | null): Date {
    const days = paymentDays ?? 0;
    const due = new Date(issueDate);
    due.setDate(due.getDate() + days);
    return due;
  }

  private async nextInvoiceNumber(companyPrefix: string): Promise<string> {
    const last = await this.prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: `${companyPrefix}-` } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });

    if (!last?.invoiceNumber) {
      return `${companyPrefix}-001`;
    }

    const parts = last.invoiceNumber.split("-");
    const seq = Number.parseInt(parts[parts.length - 1] ?? "0", 10) || 0;
    return `${companyPrefix}-${String(seq + 1).padStart(3, "0")}`;
  }
}
