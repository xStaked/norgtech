import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateOperatingUnitDto } from './create-operating-unit.dto';

export class UpdateOperatingUnitDto extends PartialType(
  OmitType(CreateOperatingUnitDto, ['farmId'] as const),
) {}
