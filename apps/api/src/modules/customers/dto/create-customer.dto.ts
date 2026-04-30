import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { CreateContactDto } from "../../contacts/dto/create-contact.dto";

export class CreateCustomerDto {
  @IsString()
  legalName!: string;

  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsString()
  segmentId!: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateContactDto)
  contacts!: CreateContactDto[];
}
