import {
  Body,
  Controller,
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
import { CustomerSegmentsService } from "./customer-segments.service";

@Controller("customer-segments")
export class CustomerSegmentsController {
  constructor(
    private readonly customerSegmentsService: CustomerSegmentsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "comercial")
  @Get()
  findAll() {
    return this.customerSegmentsService.findAll();
  }
}
