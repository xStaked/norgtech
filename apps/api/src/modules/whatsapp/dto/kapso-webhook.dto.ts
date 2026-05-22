import { IsObject, IsString } from "class-validator";

export class KapsoWebhookDto {
  @IsString()
  type!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
