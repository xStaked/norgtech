import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ description: 'Nombre completo del productor' })
  @IsString()
  @MaxLength(160)
  fullName: string;

  @ApiPropertyOptional({ description: 'Teléfono de contacto' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ description: 'Correo electrónico del productor' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({ description: 'Empresa o razón social' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @ApiPropertyOptional({ description: 'Dirección física' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'Asesor asignado' })
  @IsOptional()
  @IsUUID()
  assignedAdvisorId?: string;

  @ApiPropertyOptional({ description: 'Notas internas del productor' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
