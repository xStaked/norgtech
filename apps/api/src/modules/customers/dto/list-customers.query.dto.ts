import { CustomerType, PaymentCondition } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { IncludeInactiveQueryDto } from "../../../common/dto/include-inactive.query";

/**
 * Filtros opcionales del listado de clientes. Todos componibles (AND).
 * `active` explicito manda sobre `includeInactive`; sin `active`, el
 * comportamiento historico de `includeInactive` queda intacto.
 */
export class ListCustomersQueryDto extends IncludeInactiveQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  segmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedToUserId?: string;

  @IsOptional()
  @IsEnum(PaymentCondition)
  paymentCondition?: PaymentCondition;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  // El ternario preserva undefined de forma explicita, sin depender de que
  // class-transformer no invoque @Transform con la clave ausente. Si llegara a
  // invocarlo, `undefined === "true"` colapsaria a false y el caso "sin filtro"
  // pasaria a significar "solo inactivos".
  //
  // Un valor que no es reconocible como booleano ("basura") se deja pasar tal
  // cual para que @IsBoolean lo rechace con 400, en vez de colapsarlo a false
  // (que significaria "solo inactivos" de forma silenciosa e incoherente con
  // como se comporta paymentCondition ante un valor invalido).
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined
      ? undefined
      : value === true || value === "true"
        ? true
        : value === false || value === "false"
          ? false
          : value,
  )
  @IsBoolean()
  active?: boolean;
}
