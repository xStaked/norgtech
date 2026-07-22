import {
  Body,
  Controller,
  Delete,
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
import { CreateCustomerSegmentDto } from "./dto/create-customer-segment.dto";
import { UpdateCustomerSegmentDto } from "./dto/update-customer-segment.dto";
import { CustomerSegmentsService } from "./customer-segments.service";

@Controller("customer-segments")
export class CustomerSegmentsController {
  constructor(
    private readonly customerSegmentsService: CustomerSegmentsService,
  ) {}

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
    dto: CreateCustomerSegmentDto,
  ) {
    return this.customerSegmentsService.create(user, dto);
  }

  // El listado de clientes ya expone segment: { id, name } a estos mismos
  // roles (tecnico, facturacion, logistica), asi que abrir este endpoint no
  // filtra nada nuevo. Sin esto, el select "Filtrar por segmento" de la web
  // recibe 403 para esos roles y se pinta vacio.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    "administrador",
    "director_comercial",
    "comercial",
    "tecnico",
    "facturacion",
    "logistica",
  )
  @Get()
  findAll() {
    return this.customerSegmentsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.customerSegmentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
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
    dto: UpdateCustomerSegmentDto,
  ) {
    return this.customerSegmentsService.update(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.customerSegmentsService.remove(id);
  }
}
