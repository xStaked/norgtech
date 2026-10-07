import { Body, Controller, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateSpecialPriceListDto } from "./dto/create-special-price-list.dto";
import { SpecialPriceListsService } from "./special-price-lists.service";

const bodyPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });

@Controller("special-price-lists")
export class SpecialPriceListsController {
  constructor(private readonly specialPriceListsService: SpecialPriceListsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "promotor")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(bodyPipe) dto: CreateSpecialPriceListDto,
  ) {
    return this.specialPriceListsService.create(user, dto);
  }
}
