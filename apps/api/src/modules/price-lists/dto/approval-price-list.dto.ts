import { IsIn } from "class-validator";

/**
 * Aprueba o rechaza una lista especial. Solo estos dos verbos existen: no
 * hay edición parcial de estados, la revisión termina aprobada o rechazada.
 */
export class ApprovalPriceListDto {
  @IsIn(["aprobar", "rechazar"])
  action!: "aprobar" | "rechazar";
}
