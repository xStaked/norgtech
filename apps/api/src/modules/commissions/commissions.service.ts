import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { isEligibleSeller } from "../seller-goals/seller-eligibility";
import { CreateCommissionRuleDto } from "./dto/create-commission-rule.dto";
import { UpdateCommissionRuleDto } from "./dto/update-commission-rule.dto";

const WRITE_ROLES: UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
];

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

    return this.prisma.commissionRule.findMany({
      where: {
        ...(filters.sellerUserId
          ? { sellerUserId: filters.sellerUserId }
          : {}),
        ...(filters.periodType ? { periodType: filters.periodType } : {}),
        ...(filters.periodValue ? { periodValue: filters.periodValue } : {}),
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

  private normalizeAndValidatePeriod(periodType: string, periodValue: string) {
    const normalized = periodValue.toUpperCase();

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
