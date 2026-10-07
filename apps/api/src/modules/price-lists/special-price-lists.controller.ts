import { Body, Controller, Get, Param, Patch, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { ApprovalPriceListDto } from "./dto/approval-price-list.dto";
import { CreateSpecialPriceListDto } from "./dto/create-special-price-list.dto";
import { UpdateSpecialPriceListDto } from "./dto/update-special-price-list.dto";
import { UpdateSpecialPriceListRevisionDto } from "./dto/update-special-price-list-revision.dto";
import { SpecialPriceListsService } from "./special-price-lists.service";

const bodyPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
const specialPriceListReadRoles = ["administrador", "director_comercial", "comercial", "promotor"] as const;
const specialPriceListManagerRoles = ["administrador", "director_comercial", "promotor"] as const;

@Controller("special-price-lists")
export class SpecialPriceListsController {
  constructor(private readonly specialPriceListsService: SpecialPriceListsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...specialPriceListReadRoles)
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.specialPriceListsService.findAll(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...specialPriceListReadRoles)
  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.specialPriceListsService.findOne(user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("administrador", "director_comercial", "comercial", "promotor")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(bodyPipe) dto: CreateSpecialPriceListDto,
  ) {
    return this.specialPriceListsService.create(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...specialPriceListManagerRoles)
  @Patch(":id")
  updateList(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(bodyPipe) dto: UpdateSpecialPriceListDto,
  ) {
    return this.specialPriceListsService.updateList(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...specialPriceListReadRoles)
  @Post(":id/revisions")
  createRevision(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.specialPriceListsService.createRevision(user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...specialPriceListReadRoles)
  @Patch(":id/revisions/:revisionId")
  updateRevision(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
    @Body(bodyPipe) dto: UpdateSpecialPriceListRevisionDto,
  ) {
    return this.specialPriceListsService.updateRevision(user, id, revisionId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...specialPriceListReadRoles)
  @Post(":id/revisions/:revisionId/submit")
  submitRevision(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
  ) {
    return this.specialPriceListsService.submitRevision(user, id, revisionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...specialPriceListManagerRoles)
  @Patch(":id/revisions/:revisionId/approval")
  updateApproval(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("revisionId") revisionId: string,
    @Body(bodyPipe) dto: ApprovalPriceListDto,
  ) {
    return this.specialPriceListsService.updateApproval(user, id, revisionId, dto.action);
  }
}
