import { IsString } from "class-validator";
import { UpdateCommercialExpenseDto } from "../../commercial-expenses/dto/update-commercial-expense.dto";

export class UpdateWhatsAppExpenseDto extends UpdateCommercialExpenseDto {
  @IsString()
  conversationId!: string;
}
