import { Body, Controller, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { ExecuteWhatsAppExpenseDto } from "./dto/execute-whatsapp-expense.dto";
import { NoraExpenseExecutionService } from "./nora-expense-execution.service";

@Controller("whatsapp/agent")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NoraAgentController {
  constructor(private readonly execution: NoraExpenseExecutionService) {}

  @Roles("administrador", "director_comercial", "comercial", "facturacion")
  @Post("expenses")
  async createExpense(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ExecuteWhatsAppExpenseDto,
  ) {
    const { conversationId, ...expense } = dto;
    return this.execution.executeFromWhatsApp({
      user,
      conversationId,
      dto: expense as never,
    });
  }
}
