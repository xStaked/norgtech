import { IsString, Matches, MaxLength } from "class-validator";

export class ClonePriceListDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;
}
