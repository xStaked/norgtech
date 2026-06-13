import { IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  department?: string;
}
