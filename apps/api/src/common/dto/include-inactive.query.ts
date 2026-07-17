import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

/**
 * Opt-in flag for admin catalog list endpoints (zones, companies, products,
 * customers, users). Every list stays active-only by default, so selectors,
 * dropdowns and Nora that hit the endpoint WITHOUT this flag keep receiving
 * only active rows. Only the admin catalog list pages pass
 * `?includeInactive=true` to also surface deactivated rows (flagged with an
 * "Inactiva/Inactivo" badge) instead of hiding them (ZON-01, COM-01).
 */
export class IncludeInactiveQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeInactive?: boolean;
}
