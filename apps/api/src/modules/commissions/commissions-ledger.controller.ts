import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CommissionsService } from "./commissions.service";

/**
 * Liquidacion de comisiones (Frente 3, fase 2, Task 3).
 *
 * ACCESO: `administrador` y `director_comercial` ven todas las comisiones y
 * pueden marcar pagadas; un `comercial` entra a leer SOLO las suyas porque
 * `findCommissions` le fuerza `sellerUserId` a su propio id (matriz Frente 0,
 * mismo patron que analitica). Los demas roles no entran.
 *
 * Rutas separadas del controlador de reglas (`/commissions/rules`, solo
 * admin/director) para que la guarda de lectura del comercial no toque la
 * configuracion de reglas.
 */
@Controller("commissions")
export class CommissionsLedgerController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial")
  @Get()
  findCommissions(
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("sellerUserId") sellerUserId?: string,
  ) {
    return this.commissionsService.findCommissions(user, {
      from,
      to,
      sellerUserId,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial")
  @Patch(":id/paid")
  markPaid(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.commissionsService.markPaid(user, id);
  }
}
