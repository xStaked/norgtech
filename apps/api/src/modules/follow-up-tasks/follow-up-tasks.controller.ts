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
import { FollowUpTaskStatus } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateFollowUpTaskDto } from "./dto/create-follow-up-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { FollowUpTasksService } from "./follow-up-tasks.service";

@Controller("follow-up-tasks")
export class FollowUpTasksController {
  constructor(private readonly followUpTasksService: FollowUpTasksService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: CreateFollowUpTaskDto,
  ) {
    return this.followUpTasksService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query("status") status?: FollowUpTaskStatus,
    @Query("dueToday") dueToday?: string,
    @Query("overdue") overdue?: string,
    @Query("assignedToMe") assignedToMe?: string,
    @Query("thisWeek") thisWeek?: string,
  ) {
    const hasFilters = status || dueToday || overdue || assignedToMe || thisWeek;

    if (hasFilters) {
      return this.followUpTasksService.findWithFilters({
        status,
        dueToday: dueToday === "true",
        overdue: overdue === "true",
        assignedToMe: assignedToMe === "true",
        thisWeek: thisWeek === "true",
        userId: user.id,
      });
    }

    return this.followUpTasksService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Post("mark-overdue")
  markOverdue() {
    return this.followUpTasksService.markOverdue();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.followUpTasksService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
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
    dto: UpdateTaskStatusDto,
  ) {
    return this.followUpTasksService.updateStatus(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico")
  @Patch(":id/complete")
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.followUpTasksService.complete(user, id);
  }
}
