import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CommissionStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { BOGOTA_OFFSET } from "../../shared/instant";
import { AuthUser } from "../auth/types/authenticated-request";
import { isEligibleSeller } from "../seller-goals/seller-eligibility";
import { CreateCommissionRuleDto } from "./dto/create-commission-rule.dto";
import { UpdateCommissionRuleDto } from "./dto/update-commission-rule.dto";

const WRITE_ROLES: UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
];
// Liquidacion: los vendedores consultan las suyas; el resto de roles no
// participa (matriz Frente 0, espeja el @Roles del CommissionsLedgerController).
const READ_ROLES: UserRole[] = [...WRITE_ROLES, UserRole.comercial];
const PERIOD_TYPES = ["mensual", "trimestral", "anual"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateCommissionRuleDto) {
    this.ensureCanWrite(user);
    await this.ensureEligibleSeller(dto.sellerUserId);

    const periodValue = this.normalizeAndValidatePeriod(
      dto.periodType,
      dto.periodValue,
    );
    await this.ensureNoDuplicate(dto.sellerUserId, dto.periodType, periodValue);

    try {
      return await this.prisma.commissionRule.create({
        data: {
          sellerUserId: dto.sellerUserId,
          periodType: dto.periodType,
          periodValue,
          percent: dto.percent,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Commission rule already exists for period",
        );
      }
      throw error;
    }
  }

  async findAll(
    user: AuthUser,
    filters: { sellerUserId?: string; periodType?: string; periodValue?: string },
  ) {
    this.ensureCanWrite(user);
    const { periodType, periodValue } = this.normalizeFilters(filters);

    return this.prisma.commissionRule.findMany({
      where: {
        ...(filters.sellerUserId
          ? { sellerUserId: filters.sellerUserId }
          : {}),
        ...(periodType ? { periodType } : {}),
        ...(periodValue ? { periodValue } : {}),
      },
      orderBy: [{ periodValue: "desc" }, { createdAt: "desc" }],
    });
  }

  /**
   * % efectivo para un vendedor en un periodo. Sin regla → 0: la ausencia de
   * regla nunca bloquea el cálculo de la Task 2, simplemente no comisiona.
   */
  async effective(
    user: AuthUser,
    sellerUserId: string,
    periodType: string,
    periodValue: string,
  ) {
    this.ensureCanWrite(user);
    if (!sellerUserId || !periodType || !periodValue) {
      throw new BadRequestException(
        "sellerUserId, periodType and periodValue are required",
      );
    }
    await this.ensureEligibleSeller(sellerUserId);

    const normalizedPeriodValue = this.normalizeAndValidatePeriod(
      periodType,
      periodValue,
    );
    const percent = await this.resolvePercent(
      sellerUserId,
      periodType,
      normalizedPeriodValue,
    );

    return {
      sellerUserId,
      periodType,
      periodValue: normalizedPeriodValue,
      percent,
    };
  }

  async update(user: AuthUser, ruleId: string, dto: UpdateCommissionRuleDto) {
    this.ensureCanWrite(user);

    const rule = await this.prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException("Commission rule not found");
    }

    const periodType = dto.periodType ?? rule.periodType;
    const periodValue = this.normalizeAndValidatePeriod(
      periodType,
      dto.periodValue ?? rule.periodValue,
    );

    if (dto.periodType !== undefined || dto.periodValue !== undefined) {
      await this.ensureNoDuplicate(
        rule.sellerUserId,
        periodType,
        periodValue,
        ruleId,
      );
    }

    return this.prisma.commissionRule.update({
      where: { id: ruleId },
      data: {
        ...dto,
        periodType,
        periodValue,
        updatedBy: user.id,
      },
    });
  }

  /** Lectura consumida por la Task 2 (cálculo de comisiones). Sin regla → 0. */
  async resolvePercent(
    sellerUserId: string,
    periodType: string,
    periodValue: string,
  ): Promise<number> {
    const normalizedPeriodValue = this.normalizeAndValidatePeriod(
      periodType,
      periodValue,
    );
    const rule = await this.prisma.commissionRule.findFirst({
      where: {
        sellerUserId,
        periodType,
        periodValue: normalizedPeriodValue,
      },
    });

    return rule ? Number(rule.percent) : 0;
  }

  /**
   * Causa la comisión de un pago dentro de la transacción que lo crea
   * (Task 2, causación al cobrar). Una fila por pago, proporcional al
   * recaudo: base = valor del pago, amount = base * percent / 100, con el %
   * vigente a la fecha del pago (fallback mensual → trimestral → anual).
   * Sin vendedor o sin regla → null (no comisiona, nunca bloquea el pago).
   */
  async accrueFromPayment(
    tx: Prisma.TransactionClient,
    args: {
      sellerUserId: string | null | undefined;
      invoiceId: string;
      paymentId: string;
      base: Prisma.Decimal | number | string;
      paymentDate: Date;
    },
  ) {
    if (!args.sellerUserId) return null;

    const { percent } = await this.resolvePercentWithFallback(
      args.sellerUserId,
      args.paymentDate,
    );
    if (!percent || percent <= 0) return null;

    const base = new Prisma.Decimal(args.base);
    const amount = base.mul(percent).div(100).toDecimalPlaces(2);

    return tx.commission.create({
      data: {
        sellerUserId: args.sellerUserId,
        invoiceId: args.invoiceId,
        paymentId: args.paymentId,
        base,
        percent,
        amount,
        status: CommissionStatus.causada,
      },
    });
  }

  /**
   * Reverso proporcional ante nota crédito/devolución atada a la factura,
   * dentro de la misma transacción. El crédito cubre base pagada, así que
   * revierte crédito × (causado pendiente / base pendiente) con la misma
   * matemática de % de la causación, repartido FIFO (filas más viejas
   * primero). `reversedAmount` acumula por fila; la fila pasa a reversada
   * solo al quedar totalmente revertida. Nunca revierte más de lo causado.
   */
  async reverseForInvoice(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    creditAmount: Prisma.Decimal | number | string,
  ) {
    const dec = (value: unknown) =>
      new Prisma.Decimal(value as string | number | Prisma.Decimal);
    const credit = new Prisma.Decimal(creditAmount);
    if (credit.lte(0)) return { count: 0, reversed: new Prisma.Decimal(0) };

    // Serializa reversos concurrentes sobre la misma factura tomando row lock
    // sobre sus comisiones ANTES de leer lo pendiente (mismo patrón que
    // CreditService.lockCustomerForUpdate para el TOCTOU del cupo). Sin esto,
    // dos devoluciones concurrentes calculan el mismo pendiente y el último
    // SET pisa al primero (lost update: sub-reverso) o, con updates
    // aditivos, superarían el tope. Prisma corre en READ COMMITTED, así que
    // cada statement ve un snapshot nuevo: el que espera el lock relee lo ya
    // revertido por el otro y solo revierte el resto. Solo aplica con `tx`.
    await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Commission" WHERE "invoiceId" = ${invoiceId} FOR UPDATE
    `;

    const rows = (
      await tx.commission.findMany({
        where: { invoiceId, status: CommissionStatus.causada },
        orderBy: { createdAt: "asc" },
      })
    ).filter((row) => dec(row.percent).gt(0));

    const accrued = rows.reduce(
      (sum, row) => sum.plus(dec(row.amount).minus(dec(row.reversedAmount))),
      new Prisma.Decimal(0),
    );
    const paidBase = rows.reduce(
      (sum, row) =>
        sum.plus(
          dec(row.base).minus(
            dec(row.reversedAmount).mul(100).div(dec(row.percent)),
          ),
        ),
      new Prisma.Decimal(0),
    );

    if (accrued.lte(0) || paidBase.lte(0)) {
      return { count: 0, reversed: new Prisma.Decimal(0) };
    }

    let toReverse = Prisma.Decimal.min(credit.mul(accrued).div(paidBase), accrued)
      .toDecimalPlaces(2);
    let count = 0;
    let reversed = new Prisma.Decimal(0);

    for (const row of rows) {
      if (toReverse.lte(0)) break;
      const pending = dec(row.amount).minus(dec(row.reversedAmount));
      if (pending.lte(0)) continue;
      const piece = Prisma.Decimal.min(pending, toReverse).toDecimalPlaces(2);
      const newReversed = dec(row.reversedAmount).plus(piece);
      await tx.commission.update({
        where: { id: row.id },
        data: {
          reversedAmount: newReversed,
          status: newReversed.equals(dec(row.amount))
            ? CommissionStatus.reversada
            : CommissionStatus.causada,
        },
      });
      toReverse = toReverse.minus(piece);
      reversed = reversed.plus(piece);
      count += 1;
    }

    return { count, reversed };
  }

  /**
   * % vigente a una fecha con fallback mensual → trimestral → anual,
   * reutilizando `resolvePercent` por tipo de periodo. Devuelve también el
   * periodo que aportó el % (trazabilidad para la Task 3).
   */
  async resolvePercentWithFallback(
    sellerUserId: string,
    date: Date,
  ): Promise<{ percent: number; periodType: string; periodValue: string }> {
    const mensual = this.monthPeriodValue(date);
    const mensualPercent = await this.resolvePercent(
      sellerUserId,
      "mensual",
      mensual,
    );
    if (mensualPercent > 0) {
      return { percent: mensualPercent, periodType: "mensual", periodValue: mensual };
    }

    const trimestral = this.quarterPeriodValue(date);
    const trimestralPercent = await this.resolvePercent(
      sellerUserId,
      "trimestral",
      trimestral,
    );
    if (trimestralPercent > 0) {
      return {
        percent: trimestralPercent,
        periodType: "trimestral",
        periodValue: trimestral,
      };
    }

    const anual = this.yearPeriodValue(date);
    const anualPercent = await this.resolvePercent(
      sellerUserId,
      "anual",
      anual,
    );
    return { percent: anualPercent, periodType: "anual", periodValue: anual };
  }

  /**
   * Liquidacion por periodo (Task 3): filas de comision con vendedor, factura,
   * cliente y fecha de pago. Direccion ve todas y puede filtrar por vendedor;
   * un comercial SIEMPRE ve solo las suyas (sellerUserId forzado a su id, mismo
   * patron que `resolveFilters` en analitica §2.4). El periodo filtra por fecha
   * de pago (el hecho generador), con fronteras de dia en hora de Colombia.
   */
  async findCommissions(
    user: AuthUser,
    filters: { from?: string; to?: string; sellerUserId?: string },
  ) {
    if (!READ_ROLES.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    const sellerUserId =
      user.role === UserRole.comercial
        ? user.id
        : filters.sellerUserId || undefined;

    const range = this.paymentDateRange(filters.from, filters.to);

    return this.prisma.commission.findMany({
      where: {
        ...(sellerUserId ? { sellerUserId } : {}),
        ...(range
          ? { payment: { paymentDate: range } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        seller: { select: { id: true, name: true } },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            customer: { select: { id: true, displayName: true } },
          },
        },
        payment: { select: { id: true, paymentDate: true } },
      },
    });
  }

  /**
   * Marcar pagada (solo admin/director): el neto causado se le entrego al
   * vendedor. Con `paidAt`/`paidBy` separado del status de causacion: una nota
   * credito posterior sigue revirtiendo la fila (el reverso toca status
   * causada) y el reporte muestra el neto vivo. No se permite pagar dos veces
   * ni pagar una fila sin neto (totalmente revertida).
   */
  async markPaid(user: AuthUser, commissionId: string) {
    this.ensureCanWrite(user);

    const commission = await this.prisma.commission.findUnique({
      where: { id: commissionId },
    });
    if (!commission) {
      throw new NotFoundException("Commission not found");
    }

    if (commission.paidAt) {
      throw new ConflictException("Commission already marked as paid");
    }

    const net = new Prisma.Decimal(commission.amount).minus(
      new Prisma.Decimal(commission.reversedAmount),
    );
    if (net.lte(0)) {
      throw new ConflictException("Commission has no net amount left to pay");
    }

    // La guarda `paidAt: null` en el WHERE cierra la carrera find-then-update:
    // dos liquidaciones concurrentes cargaban la fila sin paidAt, ambas pasaban
    // el chequeo y el segundo update pisaba silenciosamente el rastro del
    // primero. Con updateMany condicional (mismo patron que
    // `VisitsService.update`/`completar`) solo la primera muta la fila; la otra
    // ve count 0 y termina en 409.
    const updatedCount = await this.prisma.commission.updateMany({
      where: { id: commissionId, paidAt: null },
      data: { paidAt: new Date(), paidBy: user.id },
    });

    if (updatedCount.count !== 1) {
      throw new ConflictException("Commission already marked as paid");
    }

    return this.prisma.commission.findUnique({ where: { id: commissionId } });
  }

  /**
   * Fronteras de dia en hora de Colombia (mismo criterio que analitica): una
   * fecha invalida es 400, no un listado sin filtro que aparenta funcionar.
   */
  private paymentDateRange(
    from?: string,
    to?: string,
  ): { gte?: Date; lte?: Date } {
    const gte = this.dayBoundary(from, "00:00:00.000");
    const lte = this.dayBoundary(to, "23:59:59.999");
    if (gte && lte && gte.getTime() > lte.getTime()) {
      throw new BadRequestException("`from` es posterior a `to`.");
    }
    return {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  private dayBoundary(day: string | undefined, time: string): Date | undefined {
    if (!day) return undefined;
    if (!DATE_ONLY.test(day)) {
      throw new BadRequestException(
        `Fecha invalida: "${day}". Formato esperado YYYY-MM-DD.`,
      );
    }
    const parsed = new Date(`${day}T${time}${BOGOTA_OFFSET}`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Fecha invalida: "${day}".`);
    }
    return parsed;
  }

  private monthPeriodValue(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  private quarterPeriodValue(date: Date): string {
    const year = date.getUTCFullYear();
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
  }

  private yearPeriodValue(date: Date): string {
    return String(date.getUTCFullYear());
  }

  private ensureCanWrite(user: AuthUser) {
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }
  }

  private async ensureEligibleSeller(sellerUserId: string) {
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerUserId },
    });

    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    if (!isEligibleSeller(seller)) {
      throw new BadRequestException("User is not an active eligible seller");
    }

    return seller;
  }

  private async ensureNoDuplicate(
    sellerUserId: string,
    periodType: string,
    periodValue: string,
    excludeRuleId?: string,
  ) {
    const existing = await this.prisma.commissionRule.findFirst({
      where: { sellerUserId, periodType, periodValue },
    });

    if (existing && existing.id !== excludeRuleId) {
      throw new ConflictException("Commission rule already exists for period");
    }
  }

  /**
   * Filtros de listado por el mismo camino que el resto: un periodValue sin
   * periodType no se puede interpretar (400, no vacío silencioso) y un par
   * completo se normaliza/valida igual que en create/effective.
   */
  private normalizeFilters(filters: {
    periodType?: string;
    periodValue?: string;
  }): { periodType?: string; periodValue?: string } {
    const { periodType, periodValue } = filters;

    if (periodValue !== undefined && periodType === undefined) {
      throw new BadRequestException(
        "periodType is required with periodValue",
      );
    }

    if (periodType === undefined) {
      return {};
    }

    if (!PERIOD_TYPES.includes(periodType)) {
      throw new BadRequestException("Invalid periodType");
    }

    if (periodValue === undefined) {
      return { periodType };
    }

    return {
      periodType,
      periodValue: this.normalizeAndValidatePeriod(periodType, periodValue),
    };
  }

  private normalizeAndValidatePeriod(periodType: string, periodValue: string) {    const normalized = periodValue.toUpperCase();

    switch (periodType) {
      case "mensual":
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
          throw new BadRequestException(
            "Invalid periodValue for mensual period",
          );
        }
        return normalized;
      case "trimestral":
        if (!/^\d{4}-Q[1-4]$/.test(normalized)) {
          throw new BadRequestException(
            "Invalid periodValue for trimestral period",
          );
        }
        return normalized;
      case "anual":
        if (!/^\d{4}$/.test(normalized)) {
          throw new BadRequestException("Invalid periodValue for anual period");
        }
        return normalized;
      default:
        throw new BadRequestException("Invalid periodType");
    }
  }
}
