import { Body, Controller, Post, UseGuards, ValidationPipe } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser } from "../auth/types/authenticated-request";
import { ExecuteWhatsAppExpenseDto } from "./dto/execute-whatsapp-expense.dto";
import { NoraExpenseExecutionService } from "./nora-expense-execution.service";

@Controller("whatsapp/agent")
@UseGuards(JwtAuthGuard)
export class NoraAgentController {
  constructor(private readonly execution: NoraExpenseExecutionService) {}

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
