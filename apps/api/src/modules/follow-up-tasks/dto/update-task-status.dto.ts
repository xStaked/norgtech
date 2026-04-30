import { FollowUpTaskStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateTaskStatusDto {
  @IsEnum(FollowUpTaskStatus)
  status!: FollowUpTaskStatus;
}
