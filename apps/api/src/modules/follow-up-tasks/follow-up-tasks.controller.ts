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
import { CreateFollowUpTaskDto } from "./dto/create-follow-up-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { FollowUpTasksService } from "./follow-up-tasks.service";

@Controller("follow-up-tasks")
export class FollowUpTasksController {
  constructor(private readonly followUpTasksService: FollowUpTasksService) {}

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
    dto: CreateFollowUpTaskDto,
  ) {
    return this.followUpTasksService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get()
  findAll() {
    return this.followUpTasksService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.followUpTasksService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
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
  @Roles("admin", "comercial")
  @Patch(":id/complete")
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.followUpTasksService.complete(user, id);
  }
}
