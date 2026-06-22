import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class RejectOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
