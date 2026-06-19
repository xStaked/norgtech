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
import { CreateSellerGoalDto } from "./dto/create-seller-goal.dto";
import { UpdateSellerGoalDto } from "./dto/update-seller-goal.dto";
import { SellerGoalsService } from "./seller-goals.service";

@Controller("users/:userId/seller-goals")
export class SellerGoalsController {
  constructor(private readonly sellerGoalsService: SellerGoalsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateSellerGoalDto,
  ) {
    return this.sellerGoalsService.create(user, userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get()
  findAllByUser(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
  ) {
    return this.sellerGoalsService.findAllByUser(user, userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get("progress")
  getProgress(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Query("periodType") periodType?: string,
    @Query("periodValue") periodValue?: string,
    @Query("companyId") companyId?: string,
  ) {
    return this.sellerGoalsService.getProgress(
      user,
      userId,
      periodType,
      periodValue,
      companyId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Patch(":goalId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Param("goalId") goalId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateSellerGoalDto,
  ) {
    return this.sellerGoalsService.update(user, userId, goalId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Delete(":goalId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("userId") userId: string,
    @Param("goalId") goalId: string,
  ) {
    return this.sellerGoalsService.remove(user, userId, goalId);
  }
}
