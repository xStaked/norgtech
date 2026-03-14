import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

const CASE_MESSAGE_TYPES = ['note', 'ai_suggestion'] as const;

export class AddCaseMessageDto {
  @ApiProperty({
    description: 'Contenido del mensaje o nota del timeline',
    example: 'Se recomienda ajustar el programa de alimentación durante 72 horas.',
  })
  @IsString()
  @MaxLength(4000)
  content!: string;

  @ApiProperty({
    enum: CASE_MESSAGE_TYPES,
    description: 'Tipo de mensaje a registrar',
  })
  @IsString()
  @IsIn(CASE_MESSAGE_TYPES)
  messageType!: 'note' | 'ai_suggestion';
}
