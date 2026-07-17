import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, ValidationPipe } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { IncludeInactiveQueryDto } from "../../common/dto/include-inactive.query";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
});

const listQueryPipe = new ValidationPipe({ transform: true, whitelist: true });

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("administrador")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query(listQueryPipe) query: IncludeInactiveQueryDto) {
    return this.usersService.findAll(query.includeInactive);
  }

  /**
   * Selector de "Vendedor" del formulario de pedido (GOAL-02). Los roles
   * coinciden con los de `POST /orders`: quien puede crear un pedido puede
   * elegir a quien se le atribuye. Sobreescribe el @Roles("administrador") de
   * la clase, que dejaria a un comercial con 403 en su propio formulario.
   *
   * Debe declararse antes de cualquier @Get(":id") o la ruta lo capturaria.
   */
  @Roles("administrador", "comercial", "director_comercial", "logistica")
  @Get("sellers")
  findSellers() {
    return this.usersService.findSellers();
  }

  @Post()
  create(@Body(validationPipe) dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(validationPipe) dto: UpdateUserDto,
  ) {
    return this.usersService.update(user, id, dto);
  }
}
