import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateCustomerGoalDto } from "./dto/create-customer-goal.dto";
import { UpdateCustomerGoalDto } from "./dto/update-customer-goal.dto";
import { OrderStatus } from "@prisma/client";

@Injectable()
export class CustomerGoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, customerId: string, dto: CreateCustomerGoalDto) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }

    return this.prisma.customerGoal.create({
      data: {
        customerId,
        periodType: dto.periodType,
        periodValue: dto.periodValue.toUpperCase(),
        targetAmount: dto.targetAmount,
        notes: dto.notes,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
  }

  findAllByCustomer(customerId: string) {
    return this.prisma.customerGoal.findMany({
      where: { customerId },
      orderBy: { periodValue: "desc" },
    });
  }

  async update(
    user: AuthUser,
    customerId: string,
    goalId: string,
    dto: UpdateCustomerGoalDto,
  ) {
    const goal = await this.prisma.customerGoal.findUnique({
      where: { id: goalId },
    });

    if (!goal || goal.customerId !== customerId) {
      throw new NotFoundException("Goal not found");
    }

    return this.prisma.customerGoal.update({
      where: { id: goalId },
      data: {
        ...dto,
        periodValue: dto.periodValue?.toUpperCase(),
        updatedBy: user.id,
      },
    });
  }

  async remove(customerId: string, goalId: string) {
    const goal = await this.prisma.customerGoal.findUnique({
      where: { id: goalId },
    });

    if (!goal || goal.customerId !== customerId) {
      throw new NotFoundException("Goal not found");
    }

    return this.prisma.customerGoal.delete({
      where: { id: goalId },
    });
  }

  async getProgress(
    customerId: string,
    periodType?: string,
    periodValue?: string,
  ) {
    let goal: { periodType: string; periodValue: string; targetAmount: number } | null = null;

    if (periodType && periodValue) {
      const found = await this.prisma.customerGoal.findFirst({
        where: { customerId, periodType, periodValue },
        orderBy: { createdAt: "desc" },
      });

      if (!found) {
        throw new NotFoundException("Goal not found for the given period");
      }

      goal = {
        periodType: found.periodType,
        periodValue: found.periodValue,
        targetAmount: Number(found.targetAmount),
      };
    } else {
      const found = await this.prisma.customerGoal.findFirst({
        where: { customerId },
        orderBy: { createdAt: "desc" },
      });

      if (!found) {
        throw new NotFoundException("No goals found for this customer");
      }

      goal = {
        periodType: found.periodType,
        periodValue: found.periodValue,
        targetAmount: Number(found.targetAmount),
      };
    }

    const { start, end } = this.getPeriodRange(goal.periodType, goal.periodValue);

    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        status: { in: [OrderStatus.facturado, OrderStatus.entregado] },
        createdAt: { gte: start, lte: end },
      },
      select: { total: true },
    });

    const soldAmount = orders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const ordersCount = orders.length;
    const percentage = goal.targetAmount > 0
      ? Number(((soldAmount / goal.targetAmount) * 100).toFixed(2))
      : 0;
    const remainingAmount = Math.max(0, goal.targetAmount - soldAmount);

    return {
      customerId,
      periodType: goal.periodType,
      periodValue: goal.periodValue,
      targetAmount: goal.targetAmount,
      soldAmount,
      percentage,
      remainingAmount,
      ordersCount,
    };
  }

  getPeriodRange(periodType: string, periodValue: string) {
    switch (periodType) {
      case "anual": {
        const year = parseInt(periodValue, 10);
        if (isNaN(year)) {
          throw new BadRequestException("Invalid periodValue for anual period");
        }
        const start = new Date(`${year}-01-01T00:00:00.000Z`);
        const end = new Date(`${year}-12-31T23:59:59.999Z`);
        return { start, end };
      }
      case "trimestral": {
        const match = periodValue.match(/^(\d{4})-Q([1-4])$/i);
        if (!match) {
          throw new BadRequestException("Invalid periodValue for trimestral period");
        }
        const year = parseInt(match[1], 10);
        const quarter = parseInt(match[2], 10);
        const startMonth = (quarter - 1) * 3;
        const endMonth = startMonth + 2;
        const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
        const end = new Date(year, endMonth + 1, 0, 23, 59, 59, 999);
        return { start, end };
      }
      case "mensual": {
        const match = periodValue.match(/^(\d{4})-(\d{2})$/i);
        if (!match) {
          throw new BadRequestException("Invalid periodValue for mensual period");
        }
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const start = new Date(year, month, 1, 0, 0, 0, 0);
        const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
        return { start, end };
      }
      default:
        throw new BadRequestException("Invalid periodType");
    }
  }
}
