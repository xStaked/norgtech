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
import { VisitStatus } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CompleteVisitDto } from "./dto/complete-visit.dto";
import { CreateVisitDto } from "./dto/create-visit.dto";
import { UpdateVisitDto } from "./dto/update-visit.dto";
import { UpdateVisitStatusDto } from "./dto/update-visit-status.dto";
import { VisitsService } from "./visits.service";

@Controller("visits")
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "promotor")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateVisitDto,
  ) {
    return this.visitsService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "promotor")
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query("status") status?: VisitStatus,
    @Query("today") today?: string,
    @Query("thisWeek") thisWeek?: string,
    @Query("overdue") overdue?: string,
    @Query("assignedToMe") assignedToMe?: string,
    @Query("customerId") customerId?: string,
  ) {
    const hasFilters = status || today || thisWeek || overdue || assignedToMe || customerId;

    if (hasFilters) {
      return this.visitsService.findWithFilters(
        {
          status,
          today: today === "true",
          thisWeek: thisWeek === "true",
          overdue: overdue === "true",
          assignedToMe: assignedToMe === "true",
          userId: user.id,
          customerId,
        },
        user,
      );
    }

    return this.visitsService.findAll(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "promotor")
  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.visitsService.findOne(user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "promotor")
  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateVisitStatusDto,
  ) {
    return this.visitsService.updateStatus(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "promotor")
  @Patch(":id/complete")
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CompleteVisitDto,
  ) {
    return this.visitsService.complete(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "promotor")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateVisitDto,
  ) {
    return this.visitsService.update(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "promotor")
  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.visitsService.remove(user, id);
  }
}
