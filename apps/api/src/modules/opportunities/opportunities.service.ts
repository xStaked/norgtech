import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OpportunityStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateOpportunityDto } from "./dto/create-opportunity.dto";
import { UpdateOpportunityStageDto } from "./dto/update-opportunity-stage.dto";
import { allowedTransitions } from "./opportunity-stage-transition-map";
import { auditState } from "../audit/audit-state";

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateOpportunityDto) {
    return this.prisma.$transaction((tx) => this.createRecord(user, dto, tx));
  }

  async updateStage(
    user: AuthUser,
    opportunityId: string,
    dto: UpdateOpportunityStageDto,
  ) {
    return this.prisma.$transaction((tx) =>
      this.updateStageRecord(user, opportunityId, dto.stage, tx, dto.lostReason),
    );
  }

  createFromNora(
    user: AuthUser,
    input: Pick<CreateOpportunityDto, "customerId" | "title" | "stage">,
    client?: Prisma.TransactionClient,
  ) {
    if (client) {
      return this.createRecord(user, input, client);
    }

    return this.create(user, input);
  }

  updateStageFromNora(
    user: AuthUser,
    opportunityId: string,
    stage: OpportunityStage,
    client?: Prisma.TransactionClient,
  ) {
    if (client) {
      return this.updateStageRecord(user, opportunityId, stage, client);
    }

    return this.updateStage(user, opportunityId, { stage });
  }

  private async assertCustomerExists(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    return customer;
  }

  findAll(user: AuthUser) {
    // Un comercial solo ve las oportunidades de su cartera (cliente asignado)
    // o asignadas a el. `assignedToUserId` rara vez se setea en create, asi
    // que el criterio de cartera es el que realmente acota.
    const where: Prisma.OpportunityWhereInput = {};
    if (user.role === "comercial") {
      where.OR = [{ assignedToUserId: user.id }, { customer: { assignedToUserId: user.id } }];
    }
    return this.prisma.opportunity.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const opportunity = await this.prisma.opportunity.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (
      opportunity &&
      user.role === "comercial" &&
      opportunity.assignedToUserId !== user.id &&
      opportunity.customer?.assignedToUserId !== user.id
    ) {
      throw new ForbiddenException("No tienes acceso a esta oportunidad");
    }
    return opportunity;
  }

  private assertCanAccess(
    user: AuthUser,
    opportunity: { assignedToUserId: string | null; customer?: { assignedToUserId?: string | null } | null },
  ) {
    if (
      user.role === "comercial" &&
      opportunity.assignedToUserId !== user.id &&
      opportunity.customer?.assignedToUserId !== user.id
    ) {
      throw new ForbiddenException("No tienes acceso a esta oportunidad");
    }
  }

  private isTransitionAllowed(
    currentStage: OpportunityStage,
    nextStage: OpportunityStage,
  ) {
    return allowedTransitions[currentStage].includes(nextStage);
  }

  private async createRecord(
    user: AuthUser,
    dto: Pick<
      CreateOpportunityDto,
      "customerId" | "title" | "stage" | "estimatedValue" | "lostReason"
    >,
    client: Prisma.TransactionClient,
  ) {
    const customer = await this.assertCustomerExists(dto.customerId);
    // Un comercial solo abre oportunidades para su cartera.
    if (user.role === "comercial" && customer.assignedToUserId !== user.id) {
      throw new ForbiddenException("No tienes acceso a este cliente");
    }

    const opportunity = await client.opportunity.create({
      data: {
        customerId: dto.customerId,
        title: dto.title,
        stage: dto.stage,
        estimatedValue: dto.estimatedValue,
        // DASH-06: `stage` en el DTO es un @IsEnum libre, asi que una
        // oportunidad puede nacer ya cerrada sin pasar por updateStage. Si solo
        // sellara la transicion, esas nacerian con closedAt NULL y no contarian.
        closedAt: dto.stage === OpportunityStage.venta_cerrada ? new Date() : null,
        // OPP-02: mismo caso para `perdida` — el form puede crear una oportunidad
        // ya perdida; solo entonces guardamos el motivo (en otros estados es NULL).
        lostReason: dto.stage === OpportunityStage.perdida ? dto.lostReason ?? null : null,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    await this.auditService.record(
      {
        entityType: "Opportunity",
        entityId: opportunity.id,
        action: "opportunity.created",
        actorUserId: user.id,
        nextState: auditState(opportunity),
      },
      client,
    );

    return opportunity;
  }

  private async updateStageRecord(
    user: AuthUser,
    opportunityId: string,
    stage: OpportunityStage,
    client: Prisma.TransactionClient,
    lostReason?: string,
  ) {
    const opportunity = await client.opportunity.findUnique({
      where: { id: opportunityId },
      include: { customer: { select: { assignedToUserId: true } } },
    });

    if (!opportunity) {
      throw new NotFoundException("Opportunity not found");
    }
    this.assertCanAccess(user, opportunity);

    if (!this.isTransitionAllowed(opportunity.stage, stage)) {
      throw new BadRequestException("Invalid opportunity stage transition");
    }

    const updatedCount = await client.opportunity.updateMany({
      where: {
        id: opportunityId,
        stage: opportunity.stage,
      },
      data: {
        stage,
        updatedBy: user.id,
        // DASH-06: nadie escribia `closedAt`, asi que el contador
        // "Ventas cerradas 30d" (stage=venta_cerrada AND closedAt >= T-30d)
        // era 0 por construccion: la columna siempre era NULL.
        //
        // No se limpia al SALIR de venta_cerrada a proposito: el mapa de
        // transiciones declara `venta_cerrada: []` (estado terminal), asi que
        // esa rama seria codigo inalcanzable. Si algun dia se permite reabrir,
        // hay que limpiarlo aqui, o un re-cierre conservaria la fecha del
        // primer cierre y caeria en la ventana equivocada.
        ...(stage === OpportunityStage.venta_cerrada ? { closedAt: new Date() } : {}),
        // OPP-02: al transicionar a `perdida` persistimos el motivo. `perdida` es
        // terminal en el mapa de transiciones, asi que no hace falta limpiarlo al
        // salir (seria codigo inalcanzable, igual que closedAt arriba).
        ...(stage === OpportunityStage.perdida ? { lostReason: lostReason ?? null } : {}),
      },
    });

    if (updatedCount.count !== 1) {
      throw new ConflictException("Opportunity stage changed before update");
    }

    const updatedOpportunity = await client.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!updatedOpportunity) {
      throw new NotFoundException("Opportunity not found");
    }

    await this.auditService.record(
      {
        entityType: "Opportunity",
        entityId: updatedOpportunity.id,
        action: "opportunity.stage_changed",
        actorUserId: user.id,
        previousState: auditState(opportunity),
        nextState: auditState(updatedOpportunity),
      },
      client,
    );

    return updatedOpportunity;
  }
}
