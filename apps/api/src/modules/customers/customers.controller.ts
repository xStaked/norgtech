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
import { AssignZoneDto } from "./dto/assign-zone.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { ListCustomersQueryDto } from "./dto/list-customers.query.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { UpdateCustomerZoneDto } from "./dto/update-customer-zone.dto";
import { CustomersService } from "./customers.service";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    )
    dto: CreateCustomerDto,
  ) {
    return this.customersService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Post("refresh-segments")
  refreshSegments(@CurrentUser() user: AuthUser) {
    return this.customersService.refreshSegments(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "facturacion", "logistica")
  @Get()
  findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: ListCustomersQueryDto,
  ) {
    return this.customersService.findAll(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "comercial", "director_comercial", "tecnico", "facturacion", "logistica")
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.customersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
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
    dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/zones")
  getZones(@Param("id") id: string) {
    return this.customersService.getCustomerZones(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Post(":id/zones")
  assignZone(
    @Param("id") id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: AssignZoneDto,
  ) {
    return this.customersService.assignZoneToCustomer(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Patch(":id/zones/:customerZoneId")
  updateZone(
    @Param("id") id: string,
    @Param("customerZoneId") customerZoneId: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: UpdateCustomerZoneDto,
  ) {
    return this.customersService.updateCustomerZone(id, customerZoneId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Delete(":id/zones/:customerZoneId")
  removeZone(
    @Param("id") id: string,
    @Param("customerZoneId") customerZoneId: string,
  ) {
    return this.customersService.removeCustomerZone(id, customerZoneId);
  }
}
