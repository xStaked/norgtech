import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import {
  CommercialExpense,
  CommercialExpenseStatus,
  NotificationType,
  Prisma,
  UserRole,
} from "@prisma/client";
import { Readable } from "node:stream";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { NotificationsService } from "../notifications/notifications.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import {
  EXPENSE_SUPPORT_ALLOWED_MIME_TYPES,
  EXPENSE_SUPPORT_MAX_BYTES,
  expenseStatusTransitions,
} from "./commercial-expense-constants";
import {
  CommercialExpensesExportService,
  ExpenseExportRow,
} from "./commercial-expenses-export.service";
import { CreateCommercialExpenseDto } from "./dto/create-commercial-expense.dto";
import { ListCommercialExpensesDto } from "./dto/list-commercial-expenses.dto";
import { UpdateCommercialExpenseStatusDto } from "./dto/update-commercial-expense-status.dto";
import { UpdateCommercialExpenseDto } from "./dto/update-commercial-expense.dto";
import { R2StorageService, UploadedExpenseSupport } from "./r2-storage.service";

type ExpenseSupportFile = Express.Multer.File;

export type ExpenseBufferFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};
type RelationValidationClient = Pick<
  PrismaService | Prisma.TransactionClient,
  "customer" | "visit"
>;

type ExpenseWithRelations = Prisma.CommercialExpenseGetPayload<{
  include: typeof commercialExpenseInclude;
}>;

const DEFAULT_EXPENSE_LIST_LIMIT = 500;

const controlRoles: UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
  UserRole.facturacion,
];

const commercialExpenseInclude = {
  submittedBy: true,
  reviewedBy: true,
  customer: true,
  visit: true,
  supports: true,
} satisfies Prisma.CommercialExpenseInclude;

@Injectable()
export class CommercialExpensesService {
  private readonly logger = new Logger(CommercialExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: R2StorageService,
    private readonly exportService: CommercialExpensesExportService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsAppService: WhatsAppService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    user: AuthUser,
    dto: CreateCommercialExpenseDto,
    file?: ExpenseSupportFile,
  ): Promise<ExpenseWithRelations> {
    const supportFile = this.assertSupportFile(file);
    return this.createWithUpload(user, dto, {
      buffer: supportFile.buffer,
      originalname: supportFile.originalname,
      mimetype: supportFile.mimetype,
      size: supportFile.size,
    });
  }

  async createFromBuffer(
    user: AuthUser,
    dto: CreateCommercialExpenseDto,
    file: ExpenseBufferFile,
  ): Promise<ExpenseWithRelations> {
    return this.createWithUpload(user, dto, file);
  }

  private async createWithUpload(
    user: AuthUser,
    dto: CreateCommercialExpenseDto,
    file: ExpenseBufferFile,
  ): Promise<ExpenseWithRelations> {
    await this.validateOptionalRelations(dto.customerId, dto.visitId);

    const uploaded = await this.storageService.uploadExpenseSupport({
      fileName: file.originalname,
      contentType: file.mimetype,
      body: file.buffer,
      sizeBytes: file.size,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const extractionModel = dto.extractionModel?.trim() || null;
        const extractionConfidence =
          dto.extractionConfidence === undefined ||
          dto.extractionConfidence === null
            ? null
            : new Prisma.Decimal(dto.extractionConfidence).toDecimalPlaces(4);
        const expense = await tx.commercialExpense.create({
          data: {
            expenseDate: new Date(dto.expenseDate),
            category: dto.category,
            amount: new Prisma.Decimal(dto.amount).toDecimalPlaces(2),
            description: dto.description,
            supplierName: dto.supplierName?.trim() || null,
            supplierNit: dto.supplierNit?.trim() || null,
            invoiceNumber: dto.invoiceNumber?.trim() || null,
            paymentMethod: dto.paymentMethod?.trim() || null,
            extractionConfidence,
            extractionModel,
            extractionReviewedAt:
              extractionConfidence === null && extractionModel === null
                ? null
                : new Date(),
            submittedByUserId: user.id,
            customerId: dto.customerId ?? null,
            visitId: dto.visitId ?? null,
            createdBy: user.id,
            updatedBy: user.id,
            supports: {
              create: this.supportCreateDataFromBuffer(user, file, uploaded),
            },
          },
          include: commercialExpenseInclude,
        });

        await this.auditService.record(
          {
            entityType: "CommercialExpense",
            entityId: expense.id,
            action: "commercial_expense.created",
            actorUserId: user.id,
            nextState: JSON.parse(JSON.stringify(expense)),
          },
          tx,
        );

        return expense;
      });
    } catch (error) {
      await this.storageService
        .deleteObject(uploaded.objectKey)
        .catch(() => undefined);
      throw error;
    }
  }

  findAll(
    user: AuthUser,
    filters: ListCommercialExpensesDto,
  ): Promise<ExpenseWithRelations[]> {
    return this.prisma.commercialExpense.findMany({
      where: this.buildWhere(user, filters),
      include: commercialExpenseInclude,
      orderBy: { expenseDate: "desc" },
      take: DEFAULT_EXPENSE_LIST_LIMIT,
    });
  }

  async findOne(user: AuthUser, id: string): Promise<ExpenseWithRelations> {
    const expense = await this.prisma.commercialExpense.findUnique({
      where: { id },
      include: commercialExpenseInclude,
    });

    if (!expense) {
      throw new NotFoundException("Commercial expense not found");
    }

    this.assertCanRead(user, expense);
    return expense;
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateCommercialExpenseDto,
  ): Promise<ExpenseWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.commercialExpense.findUnique({
        where: { id },
        include: commercialExpenseInclude,
      });

      if (!expense) {
        throw new NotFoundException("Commercial expense not found");
      }

      this.assertCanRead(user, expense);

      if (
        expense.status !== CommercialExpenseStatus.pendiente &&
        expense.status !== CommercialExpenseStatus.requiere_correccion
      ) {
        throw new BadRequestException("Commercial expense cannot be edited");
      }

      if (!this.isControlRole(user) && expense.submittedByUserId !== user.id) {
        throw new ForbiddenException("Commercial expense cannot be edited");
      }

      const customerId =
        dto.customerId === undefined ? expense.customerId : dto.customerId;
      const visitId = dto.visitId === undefined ? expense.visitId : dto.visitId;
      await this.validateOptionalRelations(customerId, visitId, tx);

      const previousState = JSON.parse(JSON.stringify(expense));
      const data: Prisma.CommercialExpenseUncheckedUpdateManyInput = {
        updatedBy: user.id,
      };

      if (dto.expenseDate !== undefined) {
        data.expenseDate = new Date(dto.expenseDate);
      }
      if (dto.category !== undefined) {
        data.category = dto.category;
      }
      if (dto.amount !== undefined) {
        data.amount = new Prisma.Decimal(dto.amount).toDecimalPlaces(2);
      }
      if (dto.description !== undefined) {
        data.description = dto.description;
      }
      if (dto.supplierName !== undefined) {
        data.supplierName = dto.supplierName?.trim() || null;
      }
      if (dto.supplierNit !== undefined) {
        data.supplierNit = dto.supplierNit?.trim() || null;
      }
      if (dto.invoiceNumber !== undefined) {
        data.invoiceNumber = dto.invoiceNumber?.trim() || null;
      }
      if (dto.paymentMethod !== undefined) {
        data.paymentMethod = dto.paymentMethod?.trim() || null;
      }
      if (dto.extractionConfidence !== undefined) {
        const extractionConfidence =
          dto.extractionConfidence === null
            ? null
            : new Prisma.Decimal(dto.extractionConfidence).toDecimalPlaces(4);
        data.extractionConfidence = extractionConfidence;
        const previousExtractionConfidence =
          expense.extractionConfidence !== null
            ? new Prisma.Decimal(expense.extractionConfidence).toDecimalPlaces(
                4,
              )
            : null;
        const extractionConfidenceChanged =
          previousExtractionConfidence === null
            ? extractionConfidence !== null
            : extractionConfidence === null ||
              !previousExtractionConfidence.equals(extractionConfidence);
        if (extractionConfidenceChanged) {
          data.extractionReviewedAt = new Date();
        }
      }
      if (dto.extractionModel !== undefined) {
        data.extractionModel = dto.extractionModel?.trim() || null;
      }
      if (dto.customerId !== undefined) {
        data.customerId = dto.customerId ?? null;
      }
      if (dto.visitId !== undefined) {
        data.visitId = dto.visitId ?? null;
      }
      if (expense.status === CommercialExpenseStatus.requiere_correccion) {
        data.status = CommercialExpenseStatus.pendiente;
        data.reviewNote = null;
        data.reviewedAt = null;
        data.reviewedByUserId = null;
      }

      const updatedCount = await tx.commercialExpense.updateMany({
        where: {
          id,
          status: expense.status,
        },
        data,
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException(
          "Commercial expense status changed before update",
        );
      }

      const updated = await tx.commercialExpense.findUnique({
        where: { id },
        include: commercialExpenseInclude,
      });

      if (!updated) {
        throw new NotFoundException("Commercial expense not found");
      }

      await this.auditService.record(
        {
          entityType: "CommercialExpense",
          entityId: updated.id,
          action: "commercial_expense.updated",
          actorUserId: user.id,
          previousState,
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      return updated;
    });
  }

  async updateStatus(
    user: AuthUser,
    id: string,
    dto: UpdateCommercialExpenseStatusDto,
  ): Promise<ExpenseWithRelations> {
    if (!this.isControlRole(user)) {
      throw new ForbiddenException("Commercial expense status cannot be updated");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.commercialExpense.findUnique({
        where: { id },
        include: commercialExpenseInclude,
      });

      if (!expense) {
        throw new NotFoundException("Commercial expense not found");
      }

      this.assertCanRead(user, expense);

      const allowedStatuses = expenseStatusTransitions[expense.status];

      if (!allowedStatuses.includes(dto.status)) {
        throw new BadRequestException(
          "Invalid commercial expense status transition",
        );
      }

      const reviewNote = dto.reviewNote?.trim();
      if (
        (dto.status === CommercialExpenseStatus.requiere_correccion ||
          dto.status === CommercialExpenseStatus.rechazado) &&
        !reviewNote
      ) {
        throw new BadRequestException("Review note is required for this status");
      }

      const previousState = JSON.parse(JSON.stringify(expense));

      const updatedCount = await tx.commercialExpense.updateMany({
        where: {
          id,
          status: expense.status,
        },
        data: {
          status: dto.status,
          reviewNote: reviewNote ?? dto.reviewNote ?? null,
          reviewedAt: new Date(),
          reviewedByUserId: user.id,
          updatedBy: user.id,
        },
      });

      if (updatedCount.count !== 1) {
        throw new ConflictException(
          "Commercial expense status changed before update",
        );
      }

      const updated = await tx.commercialExpense.findUnique({
        where: { id },
        include: commercialExpenseInclude,
      });

      if (!updated) {
        throw new NotFoundException("Commercial expense not found");
      }

      await this.auditService.record(
        {
          entityType: "CommercialExpense",
          entityId: updated.id,
          action: "commercial_expense.status_changed",
          actorUserId: user.id,
          previousState,
          nextState: JSON.parse(JSON.stringify(updated)),
        },
        tx,
      );

      if (
        dto.status === CommercialExpenseStatus.aprobado ||
        dto.status === CommercialExpenseStatus.rechazado
      ) {
        await this.notifications.emit(
          {
            userIds: [updated.submittedByUserId],
            type: NotificationType.gasto_resuelto,
            title: `Tu gasto fue ${dto.status}`,
            body: updated.description,
            entityType: "commercial_expense",
            entityId: updated.id,
            discriminator: dto.status,
          },
          tx,
        );
      }

      return updated;
    });

    if (updated.status === CommercialExpenseStatus.requiere_correccion) {
      try {
        await this.whatsAppService.notifyExpenseCorrection({
          id: updated.id,
          amount: updated.amount,
          category: updated.category,
          expenseDate: updated.expenseDate,
          description: updated.description,
          supplierName: updated.supplierName,
          supplierNit: updated.supplierNit,
          invoiceNumber: updated.invoiceNumber,
          paymentMethod: updated.paymentMethod,
          reviewNote: updated.reviewNote,
          submittedByUserId: updated.submittedByUserId,
          submittedBy: updated.submittedBy
            ? { name: updated.submittedBy.name, phone: updated.submittedBy.phone }
            : null,
        });
      } catch (error) {
        // No bloquea el cambio de estado; el comercial igual lo ve en la app.
        this.logger.error(`WhatsApp correction notify failed for ${updated.id}: ${String(error)}`);
      }
    }

    return updated;
  }

  async getSupport(
    user: AuthUser,
    expenseId: string,
    supportId: string,
  ): Promise<{ stream: Readable; fileName: string; contentType: string }> {
    const expense = await this.findOne(user, expenseId);
    const support = expense.supports.find((item) => item.id === supportId);

    if (!support) {
      throw new NotFoundException("Commercial expense support not found");
    }

    const stream = await this.storageService.getObjectStream(support.objectKey);
    return {
      stream,
      fileName: support.fileName,
      contentType: support.contentType,
    };
  }

  async summary(user: AuthUser, filters: ListCommercialExpensesDto) {
    const expenses = await this.findAll(user, filters);
    const totalAmount = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0,
    );

    return {
      totalAmount,
      byStatus: this.sumBy(expenses, "status"),
      byCategory: this.sumBy(expenses, "category"),
      byUser: this.sumBy(expenses, "submittedByUserId"),
    };
  }

  async exportRows(
    user: AuthUser,
    filters: ListCommercialExpensesDto,
  ): Promise<ExpenseExportRow[]> {
    const expenses = await this.findAll(user, filters);
    return expenses.map((expense) => ({
      expenseDate: expense.expenseDate,
      submittedByName: expense.submittedBy.name,
      category: expense.category,
      amount: expense.amount.toString(),
      currency: expense.currency,
      supplierName: expense.supplierName,
      supplierNit: expense.supplierNit,
      invoiceNumber: expense.invoiceNumber,
      paymentMethod: expense.paymentMethod,
      customerName: expense.customer?.displayName ?? null,
      visitId: expense.visitId,
      status: expense.status,
      description: expense.description,
      reviewNote: expense.reviewNote,
      reviewedAt: expense.reviewedAt,
      reviewedByName: expense.reviewedBy?.name ?? null,
      extractionConfidence: expense.extractionConfidence?.toString() ?? null,
      extractionModel: expense.extractionModel,
      createdAt: expense.createdAt,
    }));
  }

  getExportService(): CommercialExpensesExportService {
    return this.exportService;
  }

  private buildWhere(
    user: AuthUser,
    filters: ListCommercialExpensesDto,
  ): Prisma.CommercialExpenseWhereInput {
    const where: Prisma.CommercialExpenseWhereInput = {
      status: filters.status,
      category: filters.category,
      customerId: filters.customerId,
      visitId: filters.visitId,
    };

    if (this.isControlRole(user)) {
      where.submittedByUserId = filters.submittedByUserId;
    } else {
      where.submittedByUserId = user.id;
    }

    if (filters.from || filters.to) {
      where.expenseDate = {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? this.parseToFilterDate(filters.to) : undefined,
      };
    }

    return where;
  }

  private assertSupportFile(file?: ExpenseSupportFile): ExpenseSupportFile {
    if (!file) {
      throw new BadRequestException("Expense support file is required");
    }

    if (
      !EXPENSE_SUPPORT_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof EXPENSE_SUPPORT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException("Unsupported expense support content type");
    }

    if (file.size > EXPENSE_SUPPORT_MAX_BYTES) {
      throw new BadRequestException("Expense support exceeds maximum size");
    }

    return file;
  }

  private async validateOptionalRelations(
    customerId?: string | null,
    visitId?: string | null,
    client: RelationValidationClient = this.prisma,
  ): Promise<void> {
    if (customerId) {
      const customer = await client.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });

      if (!customer) {
        throw new NotFoundException("Customer not found");
      }
    }

    if (visitId) {
      const visit = await client.visit.findUnique({
        where: { id: visitId },
        select: { id: true, customerId: true },
      });

      if (!visit) {
        throw new NotFoundException("Visit not found");
      }

      if (customerId && visit.customerId !== customerId) {
        throw new BadRequestException("Visit does not belong to customer");
      }
    }
  }

  private assertCanRead(user: AuthUser, expense: CommercialExpense): void {
    if (this.isControlRole(user)) return;

    if (expense.submittedByUserId !== user.id) {
      throw new ForbiddenException("Commercial expense is not accessible");
    }
  }

  private parseToFilterDate(value: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T23:59:59.999Z`);
    }

    return new Date(value);
  }

  private isControlRole(user: AuthUser): boolean {
    return controlRoles.includes(user.role);
  }

  private supportCreateDataFromBuffer(
    user: AuthUser,
    file: ExpenseBufferFile,
    uploaded: UploadedExpenseSupport,
  ): Prisma.CommercialExpenseSupportCreateWithoutExpenseInput {
    return {
      bucket: uploaded.bucket,
      objectKey: uploaded.objectKey,
      fileName: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: { connect: { id: user.id } },
    };
  }

  private sumBy(
    expenses: ExpenseWithRelations[],
    field: "status" | "category" | "submittedByUserId",
  ): Record<string, number> {
    return expenses.reduce<Record<string, number>>((totals, expense) => {
      const key = expense[field];
      totals[key] = (totals[key] ?? 0) + Number(expense.amount);
      return totals;
    }, {});
  }
}
