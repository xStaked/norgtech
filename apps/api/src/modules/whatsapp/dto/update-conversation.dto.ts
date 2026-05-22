import { WhatsAppConversationStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, ValidateIf } from "class-validator";

export class UpdateConversationDto {
  @IsOptional()
  @IsEnum(WhatsAppConversationStatus)
  status?: WhatsAppConversationStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  assignedToUserId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  contactId?: string | null;
}
