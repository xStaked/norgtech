import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  sessionId?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  content!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  contextType?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  contextEntityId?: string;
}
