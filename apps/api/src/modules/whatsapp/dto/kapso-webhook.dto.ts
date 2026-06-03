import { IsOptional, IsString } from "class-validator";

export class KapsoWebhookDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  data?: unknown;
}
