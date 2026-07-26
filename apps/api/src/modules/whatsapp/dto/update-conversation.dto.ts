import { UserRole, WhatsAppConversationStatus } from "@prisma/client";
import { IsEnum, IsIn, IsOptional, IsString, ValidateIf } from "class-validator";
import { UNICANAL_AGENT_ROLES } from "../unicanal-roles";

export class UpdateConversationDto {
  @IsOptional()
  @IsEnum(WhatsAppConversationStatus)
  status?: WhatsAppConversationStatus;

  /** Reasignar el area que atiende. Solo roles atendibles: un supervisor no atiende. */
  @IsOptional()
  @IsIn(UNICANAL_AGENT_ROLES as readonly string[])
  assignedToRole?: UserRole;

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
