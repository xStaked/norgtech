import { PartialType } from "@nestjs/mapped-types";
import { CreateCommercialExpenseDto } from "./create-commercial-expense.dto";

export class UpdateCommercialExpenseDto extends PartialType(
  CreateCommercialExpenseDto,
) {}
