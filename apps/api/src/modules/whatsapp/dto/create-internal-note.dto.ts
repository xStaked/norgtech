import { IsString, MinLength } from "class-validator";

export class CreateInternalNoteDto {
  @IsString()
  @MinLength(2)
  body!: string;
}
