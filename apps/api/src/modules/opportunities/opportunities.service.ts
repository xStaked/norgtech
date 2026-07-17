import {
  BadRequestException,
  ConflictException,
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
  }

  findAll() {
    return this.prisma.opportunity.findMany({
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(id: string) {
    return this.prisma.opportunity.findUnique({
      where: { id },
      include: { customer: true },
    });
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
    await this.assertCustomerExists(dto.customerId);

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
        nextState: JSON.parse(JSON.stringify(opportunity)),
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
    });

    if (!opportunity) {
      throw new NotFoundException("Opportunity not found");
    }

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
        previousState: JSON.parse(JSON.stringify(opportunity)),
        nextState: JSON.parse(JSON.stringify(updatedOpportunity)),
      },
      client,
    );

    return updatedOpportunity;
  }
}
