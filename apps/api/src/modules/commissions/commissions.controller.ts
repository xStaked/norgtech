import {
  Body,
  Controller,
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
import { CommissionsService } from "./commissions.service";
import { CreateCommissionRuleDto } from "./dto/create-commission-rule.dto";
import { UpdateCommissionRuleDto } from "./dto/update-commission-rule.dto";

@Controller("commissions/rules")
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateCommissionRuleDto,
  ) {
    return this.commissionsService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query("sellerUserId") sellerUserId?: string,
    @Query("periodType") periodType?: string,
    @Query("periodValue") periodValue?: string,
  ) {
    return this.commissionsService.findAll(user, {
      sellerUserId,
      periodType,
      periodValue,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Get("effective")
  effective(
    @CurrentUser() user: AuthUser,
    @Query("sellerUserId") sellerUserId: string,
    @Query("periodType") periodType: string,
    @Query("periodValue") periodValue: string,
  ) {
    return this.commissionsService.effective(
      user,
      sellerUserId,
      periodType,
      periodValue,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Patch(":ruleId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("ruleId") ruleId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateCommissionRuleDto,
  ) {
    return this.commissionsService.update(user, ruleId, dto);
  }
}
