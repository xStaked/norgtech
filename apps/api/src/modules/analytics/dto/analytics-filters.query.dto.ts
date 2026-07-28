import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Filtros compartidos por las 4 pantallas de analitica
 * (docs/analytics-spec.md §2.1). Son identicos a proposito: el front dibuja UNA
 * barra de filtros y sirve para las cuatro.
 */
export class AnalyticsFiltersQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  /** Solo cartera: una cartera es una foto a una fecha, no un acumulado. */
  @IsOptional()
  @IsISO8601({ strict: true })
  asOf?: string;

  /**
   * Ni `Order` ni `Invoice` tienen moneda: la fuente de verdad es
   * `Customer.currency`. Siempre hay una moneda activa y nunca se suman dos.
   */
  @IsOptional()
  @IsEnum(["COP", "USD"])
  currency?: "COP" | "USD";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sellerUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  zoneId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  segmentId?: string;

  /** Solo ventas. */
  @IsOptional()
  @IsEnum(["day", "week", "month"])
  granularity?: "day" | "week" | "month";

  @IsOptional()
  @IsEnum(["json", "csv", "pdf"])
  format?: "json" | "csv" | "pdf";
}
