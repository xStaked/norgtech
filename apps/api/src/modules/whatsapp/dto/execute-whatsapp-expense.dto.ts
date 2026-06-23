import { IsString } from "class-validator";
import { CreateCommercialExpenseDto } from "../../commercial-expenses/dto/create-commercial-expense.dto";

export class ExecuteWhatsAppExpenseDto extends CreateCommercialExpenseDto {
  @IsString()
  conversationId!: string;
}
