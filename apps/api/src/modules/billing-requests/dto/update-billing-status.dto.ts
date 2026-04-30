import { BillingRequestStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateBillingStatusDto {
  @IsEnum(BillingRequestStatus)
  status!: BillingRequestStatus;
}
