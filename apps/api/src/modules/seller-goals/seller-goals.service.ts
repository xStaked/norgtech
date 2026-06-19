import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OrderStatus, Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateSellerGoalDto } from "./dto/create-seller-goal.dto";
import { UpdateSellerGoalDto } from "./dto/update-seller-goal.dto";

const SELLER_ROLES: UserRole[] = [
  UserRole.comercial,
  UserRole.director_comercial,
];
const WRITE_ROLES: UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
];
const PROGRESS_STATUSES: OrderStatus[] = [
  OrderStatus.facturado,
  OrderStatus.despachado,
  OrderStatus.en_transito,
  OrderStatus.entregado,
];

@Injectable()
export class SellerGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, userId: string, dto: CreateSellerGoalDto) {
    this.ensureCanWrite(user);
    await this.ensureEligibleSeller(userId);

    const periodValue = this.normalizeAndValidatePeriod(
      dto.periodType,
      dto.periodValue,
    );
    await this.ensureNoDuplicate(userId, dto.periodType, periodValue);

    try {
      return await this.prisma.sellerGoal.create({
        data: {
          userId,
          periodType: dto.periodType,
          periodValue,
          targetAmount: dto.targetAmount,
          notes: dto.notes ?? null,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Seller goal already exists for period");
      }
      throw error;
    }
  }

  async findAllByUser(user: AuthUser, userId: string) {
    this.ensureCanRead(user, userId);
    await this.ensureEligibleSeller(userId);

    return this.prisma.sellerGoal.findMany({
      where: { userId },
      orderBy: [{ periodValue: "desc" }, { createdAt: "desc" }],
    });
  }

  async update(
    user: AuthUser,
    userId: string,
    goalId: string,
    dto: UpdateSellerGoalDto,
  ) {
    this.ensureCanWrite(user);
    await this.ensureEligibleSeller(userId);

    const goal = await this.prisma.sellerGoal.findUnique({
      where: { id: goalId },
    });

    if (!goal || goal.userId !== userId) {
      throw new NotFoundException("Seller goal not found");
    }

    const periodType = dto.periodType ?? goal.periodType;
    const periodValue = this.normalizeAndValidatePeriod(
      periodType,
      dto.periodValue ?? goal.periodValue,
    );

    if (dto.periodType !== undefined || dto.periodValue !== undefined) {
      await this.ensureNoDuplicate(userId, periodType, periodValue, goalId);
    }

    return this.prisma.sellerGoal.update({
      where: { id: goalId },
      data: {
        ...dto,
        periodType,
        periodValue,
        notes: dto.notes === undefined ? undefined : dto.notes ?? null,
        updatedBy: user.id,
      },
    });
  }

  async remove(user: AuthUser, userId: string, goalId: string) {
    this.ensureCanWrite(user);

    const goal = await this.prisma.sellerGoal.findUnique({
      where: { id: goalId },
    });

    if (!goal || goal.userId !== userId) {
      throw new NotFoundException("Seller goal not found");
    }

    return this.prisma.sellerGoal.delete({
      where: { id: goalId },
    });
  }

  async getProgress(
    user: AuthUser,
    userId: string,
    periodType?: string,
    periodValue?: string,
    companyId?: string,
  ) {
    this.ensureCanRead(user, userId);
    const seller = await this.ensureEligibleSeller(userId);

    const goal = await this.findGoalForProgress(userId, periodType, periodValue);
    const { start, end } = this.getPeriodRange(
      goal.periodType,
      goal.periodValue,
    );

    return this.buildProgress(
      {
        ...goal,
        user: { name: seller.name },
        range: { start, end },
      },
      companyId,
    );
  }

  async getDashboard(
    user: AuthUser,
    periodType?: string,
    periodValue?: string,
    companyId?: string,
  ) {
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    const normalizedPeriod = this.normalizeDashboardPeriod(
      periodType,
      periodValue,
    );
    const goals = await this.prisma.sellerGoal.findMany({
      where: {
        ...normalizedPeriod,
        user: {
          active: true,
          role: { in: SELLER_ROLES },
        },
      },
      include: {
        user: { select: { id: true, name: true, active: true, role: true } },
      },
      orderBy: { periodValue: "desc" },
    });

    const items = await this.buildDashboardItems(goals, companyId);
    const targetAmount = items.reduce(
      (sum, item) => sum + item.targetAmount,
      0,
    );
    const soldAmount = items.reduce((sum, item) => sum + item.soldAmount, 0);

    return {
      ...normalizedPeriod,
      companyId: companyId ?? null,
      totals: {
        targetAmount,
        soldAmount,
        percentage:
          targetAmount > 0
            ? Number(((soldAmount / targetAmount) * 100).toFixed(2))
            : 0,
        remainingAmount: Math.max(0, targetAmount - soldAmount),
        sellers: items.length,
      },
      items: items.sort((a, b) => b.percentage - a.percentage),
    };
  }

  private ensureCanWrite(user: AuthUser) {
    if (!WRITE_ROLES.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }
  }

  private ensureCanRead(user: AuthUser, userId: string) {
    if (WRITE_ROLES.includes(user.role) || user.id === userId) {
      return;
    }

    throw new ForbiddenException("Insufficient permissions");
  }

  private async ensureEligibleSeller(userId: string) {
    const seller = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!seller) {
      throw new NotFoundException("Seller not found");
    }

    if (!seller.active || !SELLER_ROLES.includes(seller.role)) {
      throw new BadRequestException("User is not an active eligible seller");
    }

    return seller;
  }

  private async ensureNoDuplicate(
    userId: string,
    periodType: string,
    periodValue: string,
    excludeGoalId?: string,
  ) {
    const existing = await this.prisma.sellerGoal.findFirst({
      where: { userId, periodType, periodValue },
    });

    if (existing && existing.id !== excludeGoalId) {
      throw new ConflictException("Seller goal already exists for period");
    }
  }

  private async findGoalForProgress(
    userId: string,
    periodType?: string,
    periodValue?: string,
  ) {
    if ((periodType && !periodValue) || (!periodType && periodValue)) {
      throw new BadRequestException(
        "periodType and periodValue are required together",
      );
    }

    if (periodType && periodValue) {
      const normalizedPeriodValue = this.normalizeAndValidatePeriod(
        periodType,
        periodValue,
      );
      const found = await this.prisma.sellerGoal.findFirst({
        where: {
          userId,
          periodType,
          periodValue: normalizedPeriodValue,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!found) {
        throw new NotFoundException("Seller goal not found for period");
      }

      return found;
    }

    const found = await this.prisma.sellerGoal.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!found) {
      throw new NotFoundException("No seller goals found");
    }

    return found;
  }

  private normalizeDashboardPeriod(periodType?: string, periodValue?: string) {
    if ((periodType && !periodValue) || (!periodType && periodValue)) {
      throw new BadRequestException(
        "periodType and periodValue are required together",
      );
    }

    if (periodType && periodValue) {
      return {
        periodType,
        periodValue: this.normalizeAndValidatePeriod(periodType, periodValue),
      };
    }

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return {
      periodType: "mensual",
      periodValue: `${now.getFullYear()}-${month}`,
    };
  }

  private async buildProgress(
    goal: {
      userId: string;
      periodType: string;
      periodValue: string;
      targetAmount: unknown;
      user?: { name: string } | null;
      range?: { start: Date; end: Date };
    },
    companyId?: string,
  ) {
    const { start, end } =
      goal.range ?? this.getPeriodRange(goal.periodType, goal.periodValue);
    const orders = await this.prisma.order.findMany({
      where: {
        customer: { assignedToUserId: goal.userId },
        status: { in: PROGRESS_STATUSES },
        orderDate: { gte: start, lte: end },
        ...(companyId ? { companyId } : {}),
      },
      select: { id: true, total: true, customerId: true },
    });
    const soldAmount = orders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const targetAmount = Number(goal.targetAmount);
    const percentage =
      targetAmount > 0
        ? Number(((soldAmount / targetAmount) * 100).toFixed(2))
        : 0;

    return {
      userId: goal.userId,
      sellerName: goal.user?.name ?? "",
      companyId: companyId ?? null,
      periodType: goal.periodType,
      periodValue: goal.periodValue,
      targetAmount,
      soldAmount,
      remainingAmount: Math.max(0, targetAmount - soldAmount),
      percentage,
      ordersCount: orders.length,
      customersCount: new Set(orders.map((order) => order.customerId)).size,
    };
  }

  private async buildDashboardItems(
    goals: Array<{
      userId: string;
      periodType: string;
      periodValue: string;
      targetAmount: unknown;
      user?: { name: string } | null;
    }>,
    companyId?: string,
  ) {
    if (goals.length === 0) {
      return [];
    }

    const { start, end } = this.getPeriodRange(
      goals[0].periodType,
      goals[0].periodValue,
    );
    const sellerIds = goals.map((goal) => goal.userId);
    const orders = await this.prisma.order.findMany({
      where: {
        customer: { assignedToUserId: { in: sellerIds } },
        status: { in: PROGRESS_STATUSES },
        orderDate: { gte: start, lte: end },
        ...(companyId ? { companyId } : {}),
      },
      select: {
        id: true,
        total: true,
        customerId: true,
        customer: { select: { assignedToUserId: true } },
      },
    });

    const ordersBySeller = new Map<string, typeof orders>();
    for (const order of orders) {
      const sellerId = order.customer?.assignedToUserId;
      if (!sellerId) continue;
      const sellerOrders = ordersBySeller.get(sellerId) ?? [];
      sellerOrders.push(order);
      ordersBySeller.set(sellerId, sellerOrders);
    }

    return goals.map((goal) => {
      const sellerOrders = ordersBySeller.get(goal.userId) ?? [];
      const soldAmount = sellerOrders.reduce(
        (sum, order) => sum + Number(order.total),
        0,
      );
      const targetAmount = Number(goal.targetAmount);
      const percentage =
        targetAmount > 0
          ? Number(((soldAmount / targetAmount) * 100).toFixed(2))
          : 0;

      return {
        userId: goal.userId,
        sellerName: goal.user?.name ?? "",
        companyId: companyId ?? null,
        periodType: goal.periodType,
        periodValue: goal.periodValue,
        targetAmount,
        soldAmount,
        remainingAmount: Math.max(0, targetAmount - soldAmount),
        percentage,
        ordersCount: sellerOrders.length,
        customersCount: new Set(
          sellerOrders.map((order) => order.customerId),
        ).size,
      };
    });
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

  private getPeriodRange(periodType: string, periodValue: string) {
    switch (periodType) {
      case "mensual": {
        const [yearPart, monthPart] = periodValue.split("-");
        const year = Number(yearPart);
        const month = Number(monthPart);
        return {
          start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
          end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
        };
      }
      case "trimestral": {
        const match = periodValue.match(/^(\d{4})-Q([1-4])$/);
        if (!match) {
          throw new BadRequestException(
            "Invalid periodValue for trimestral period",
          );
        }
        const year = Number(match[1]);
        const quarter = Number(match[2]);
        const startMonth = (quarter - 1) * 3;
        return {
          start: new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0)),
          end: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999)),
        };
      }
      case "anual": {
        const year = Number(periodValue);
        return {
          start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
          end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
        };
      }
      default:
        throw new BadRequestException("Invalid periodType");
    }
  }
}
