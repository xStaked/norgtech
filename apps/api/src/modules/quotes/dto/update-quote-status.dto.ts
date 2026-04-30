import { IsEnum } from "class-validator";
import { QuoteStatus } from "@prisma/client";

export class UpdateQuoteStatusDto {
  @IsEnum(QuoteStatus)
  status!: QuoteStatus;
}
