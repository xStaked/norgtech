import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOpportunityDto } from "./dto/create-opportunity.dto";
import { UpdateOpportunityStageDto } from "./dto/update-opportunity-stage.dto";
import { OpportunitiesService } from "./opportunities.service";

@Controller("opportunities")
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateOpportunityDto,
  ) {
    return this.opportunitiesService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Patch(":id/stage")
  updateStage(
    @CurrentUser() user: AuthUser,
    @Param("id") opportunityId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateOpportunityStageDto,
  ) {
    return this.opportunitiesService.updateStage(user, opportunityId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get()
  findAll() {
    return this.opportunitiesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.opportunitiesService.findOne(id);
  }
}
