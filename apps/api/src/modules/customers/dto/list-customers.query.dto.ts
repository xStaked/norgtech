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

  // El ternario preserva undefined de forma explicita: no depende de que
  // class-transformer omita la llamada a @Transform cuando el param no vino
  // (de hecho no la omite en este stack). Sin el ternario, un
  // `undefined === "true"` colapsaria a false (= filtrar solo inactivos)
  // el caso "sin filtro".
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === "true",
  )
  @IsBoolean()
  active?: boolean;
}
