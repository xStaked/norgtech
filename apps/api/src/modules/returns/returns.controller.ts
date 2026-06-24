import {
  Body,
  Controller,
  Get,
  Param,
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
import { ReturnsService } from "./returns.service";
import { CreateReturnDto } from "./dto/create-return.dto";
import { ListReturnsDto } from "./dto/list-returns.dto";

const returnRoles = [
  "administrador",
  "director_comercial",
  "facturacion",
  "comercial",
] as const;

const validationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller("returns")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Roles(...returnRoles)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(validationPipe) dto: CreateReturnDto,
  ) {
    return this.returnsService.create(user, dto);
  }

  @Roles(...returnRoles)
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query(validationPipe) filters: ListReturnsDto,
  ) {
    return this.returnsService.findAll(user, filters);
  }

  @Roles(...returnRoles)
  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.returnsService.findOne(user, id);
  }
}
