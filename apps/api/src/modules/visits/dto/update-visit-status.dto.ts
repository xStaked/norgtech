import { VisitStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateVisitStatusDto {
  @IsEnum(VisitStatus)
  status!: VisitStatus;
}
