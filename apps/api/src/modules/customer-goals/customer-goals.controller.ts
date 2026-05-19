import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateCustomerGoalDto } from "./dto/create-customer-goal.dto";
import { UpdateCustomerGoalDto } from "./dto/update-customer-goal.dto";
import { CustomerGoalsService } from "./customer-goals.service";

@Controller("customers")
export class CustomerGoalsController {
  constructor(private readonly customerGoalsService: CustomerGoalsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Post(":id/goals")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") customerId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateCustomerGoalDto,
  ) {
    return this.customerGoalsService.create(user, customerId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    "administrador",
    "director_comercial",
    "comercial",
    "tecnico",
    "facturacion",
    "logistica",
  )
  @Get(":id/goals")
  findAllByCustomer(@Param("id") customerId: string) {
    return this.customerGoalsService.findAllByCustomer(customerId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Patch(":id/goals/:goalId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") customerId: string,
    @Param("goalId") goalId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateCustomerGoalDto,
  ) {
    return this.customerGoalsService.update(user, customerId, goalId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Delete(":id/goals/:goalId")
  remove(
    @Param("id") customerId: string,
    @Param("goalId") goalId: string,
  ) {
    return this.customerGoalsService.remove(customerId, goalId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    "administrador",
    "director_comercial",
    "comercial",
    "tecnico",
    "facturacion",
    "logistica",
  )
  @Get(":id/goal-progress")
  getProgress(
    @Param("id") customerId: string,
    @Query("periodType") periodType?: string,
    @Query("periodValue") periodValue?: string,
  ) {
    return this.customerGoalsService.getProgress(
      customerId,
      periodType,
      periodValue,
    );
  }
}
