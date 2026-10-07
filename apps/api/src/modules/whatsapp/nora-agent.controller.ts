import { Body, Controller, Param, Patch, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { ExecuteWhatsAppExpenseDto } from "./dto/execute-whatsapp-expense.dto";
import { UpdateWhatsAppExpenseDto } from "./dto/update-whatsapp-expense.dto";
import { NoraExpenseExecutionService } from "./nora-expense-execution.service";
import { RATE_LIMITS } from "./rate-limits.constants";

@Controller("whatsapp/agent")
@UseGuards(JwtAuthGuard, RolesGuard)
// Throttle fino (fase 3): cada confirmación del agente toca el medio de Kapso,
// R2 y el registro del gasto; los turnos son caros y llegan por conversación.
// Límites generosos del mapa de constantes: no cortan el flujo real de un
// comercial, sólo el martilleo automatizado.
@Throttle({ default: { ...RATE_LIMITS.noraAgent } })
export class NoraAgentController {
  constructor(private readonly execution: NoraExpenseExecutionService) {}

  @Roles("administrador", "director_comercial", "comercial", "facturacion", "promotor")
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
      dto: expense,
    });
  }

  // The broad @Roles list is safe here: the routing service always mints a token
  // scoped to the expense's submitter before calling this endpoint, and
  // CommercialExpensesService.update enforces submitter-or-control-role ownership.
  @Roles("administrador", "director_comercial", "comercial", "facturacion", "promotor")
  @Patch("expenses/:id")
  async updateExpense(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateWhatsAppExpenseDto,
  ) {
    const { conversationId, ...expense } = dto;
    return this.execution.updateFromWhatsApp({
      user,
      conversationId,
      expenseId: id,
      dto: expense,
    });
  }
}
