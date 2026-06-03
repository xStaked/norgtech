import { IsObject, IsOptional, IsString } from "class-validator";

export class KapsoWebhookDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
