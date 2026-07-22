import { PaymentCondition } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { IncludeInactiveQueryDto } from "../../../common/dto/include-inactive.query";

/**
 * Filtros opcionales del listado de clientes. Todos componibles (AND).
 * `active` explicito manda sobre `includeInactive`; sin `active`, el
 * comportamiento historico de `includeInactive` queda intacto.
 */
export class ListCustomersQueryDto extends IncludeInactiveQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  segmentId?: string;

  @IsOptional()
  @IsEnum(PaymentCondition)
  paymentCondition?: PaymentCondition;

  // El ternario preserva undefined de forma explicita, sin depender de que
  // class-transformer no invoque @Transform con la clave ausente. Si llegara a
  // invocarlo, `undefined === "true"` colapsaria a false y el caso "sin filtro"
  // pasaria a significar "solo inactivos".
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === "true",
  )
  @IsBoolean()
  active?: boolean;
}
