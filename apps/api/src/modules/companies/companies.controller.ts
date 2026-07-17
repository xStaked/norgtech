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
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ROLE_GROUPS } from "../auth/permissions";
import { IncludeInactiveQueryDto } from "../../common/dto/include-inactive.query";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

const listQueryPipe = new ValidationPipe({ transform: true, whitelist: true });

@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLE_GROUPS.ADMIN_AND_DIRECTOR)
  @Post()
  create(
    @Body(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    )
    dto: CreateCompanyDto,
  ) {
    return this.companiesService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query(listQueryPipe) query: IncludeInactiveQueryDto) {
    return this.companiesService.findAll(query.includeInactive);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.companiesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLE_GROUPS.ADMIN_AND_DIRECTOR)
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    )
    dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, dto);
  }
}
