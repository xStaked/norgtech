import { IsOptional, IsString } from "class-validator";

export class ListPaymentsDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;
}
