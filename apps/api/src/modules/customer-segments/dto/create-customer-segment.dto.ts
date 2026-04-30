import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateCustomerSegmentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
