import { Type } from "class-transformer";
import {
  IsArray,
  IsDefined,
  IsIn,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";
import { LauraProposalPayload } from "../laura.types";

class LauraClarificationOptionDto {
  @IsString()
  @Matches(/\S/)
  id!: string;

  @IsString()
  @Matches(/\S/)
  label!: string;
}

class LauraProposalCustomerDto {
  @IsString()
  @IsIn(["resolved", "ambiguous", "missing"])
  status!: LauraProposalPayload["customer"]["status"];

  @IsOptional()
  @ValidateNested()
  @Type(() => LauraClarificationOptionDto)
  selectedOption?: LauraClarificationOptionDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LauraClarificationOptionDto)
  options?: LauraClarificationOptionDto[];
}

class LauraProposalPayloadDto implements LauraProposalPayload {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => LauraProposalCustomerDto)
  customer!: LauraProposalCustomerDto;

  @IsString()
  @Matches(/\S/)
  summary!: string;

  @IsArray()
  @IsString({ each: true })
  suggestedActions!: string[];
}

export class ConfirmProposalDto {
  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => LauraProposalPayloadDto)
  proposal!: LauraProposalPayloadDto;
}
