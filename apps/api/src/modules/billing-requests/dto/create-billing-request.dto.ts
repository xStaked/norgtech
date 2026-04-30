import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateBillingRequestDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;

  @IsOptional()
  @IsString()
  sourceQuoteId?: string;

  @IsOptional()
  @IsString()
  sourceOrderId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
