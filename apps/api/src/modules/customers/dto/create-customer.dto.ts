import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateContactDto } from "../../contacts/dto/create-contact.dto";

class CreateInitialGoalDto {
  @IsString()
  @IsIn(["mensual", "trimestral", "anual"])
  periodType!: string;

  @IsString()
  periodValue!: string;

  @IsNumber()
  @Min(0)
  targetAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  legalName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  displayName!: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
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
  @IsNotEmpty()
  @Matches(/\S/)
  assignedToUserId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateContactDto)
  contacts!: CreateContactDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateInitialGoalDto)
  initialGoal?: CreateInitialGoalDto;
}
