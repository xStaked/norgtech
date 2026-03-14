import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { ListVisitsQueryDto } from './dto/list-visits-query.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';

type FarmContext = {
  id: string;
  clientId: string;
  speciesType: string;
  name: string;
};

type CaseContext = {
  id: string;
  clientId: string;
  farmId: string | null;
  caseNumber: number;
  title: string;
  status: string;
};

@Injectable()
export class VisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListVisitsQueryDto) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const where: Prisma.TechnicalVisitWhereInput = {
      organizationId,
      ...(query.advisorId ? { advisorId: query.advisorId } : {}),
      ...(scopedClientId || query.clientId
        ? { clientId: scopedClientId ?? query.clientId }
        : {}),
      ...(query.farmId ? { farmId: query.farmId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            visitDate: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const items = await this.prisma.technicalVisit.findMany({
      where,
      include: this.visitInclude(),
      orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      items: items.map((item) => this.serializeVisit(item)),
      meta: {
        total: items.length,
        filters: query,
      },
    };
  }

  async create(user: AuthUser, dto: CreateVisitDto) {
    const organizationId = this.requireOrganizationId(user);
    const clientId = this.resolveMutationClientId(user, dto.clientId);
    const farm = await this.ensureFarmContext(dto.farmId, organizationId, clientId);

    if (farm.clientId !== clientId) {
      throw new BadRequestException(
        'La granja seleccionada no pertenece al productor indicado.',
      );
    }

    await this.ensureClientBelongsToOrganization(clientId, organizationId);
    await this.ensureAdvisorBelongsToOrganization(dto.advisorId, organizationId);

    const linkedCase = dto.caseId
      ? await this.ensureCaseContext(dto.caseId, organizationId)
      : null;

    if (linkedCase) {
      this.assertCaseMatchesVisit(linkedCase, clientId, dto.farmId);
    }

    const created = await this.prisma.technicalVisit.create({
      data: {
        organizationId,
        caseId: this.cleanOptional(dto.caseId),
        clientId,
        farmId: dto.farmId,
        advisorId: dto.advisorId,
        visitDate: new Date(dto.visitDate),
        ...this.buildSpeciesMetrics(dto, farm.speciesType),
        observations: this.cleanOptional(dto.observations),
        recommendations: this.cleanOptional(dto.recommendations),
      },
      include: this.visitInclude(),
    });

    return this.serializeVisit(created);
  }

  async findOne(user: AuthUser, id: string) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const visit = await this.prisma.technicalVisit.findFirst({
      where: {
        id,
        organizationId,
        ...(scopedClientId ? { clientId: scopedClientId } : {}),
      },
      include: this.visitInclude(),
    });

    if (!visit) {
      throw new NotFoundException('Visita no encontrada');
    }

    return this.serializeVisit(visit);
  }

  async update(user: AuthUser, id: string, dto: UpdateVisitDto) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const existingVisit = await this.ensureVisitBelongsToOrganization(
      id,
      organizationId,
      scopedClientId,
    );

    const nextClientId =
      dto.clientId !== undefined
        ? this.resolveMutationClientId(user, dto.clientId)
        : existingVisit.clientId;
    const nextFarmId = dto.farmId ?? existingVisit.farmId;
    const nextAdvisorId = dto.advisorId ?? existingVisit.advisorId;
    const nextCaseId =
      dto.caseId !== undefined ? this.cleanOptional(dto.caseId) : existingVisit.caseId;

    const farm = await this.ensureFarmContext(nextFarmId, organizationId, nextClientId);

    if (farm.clientId !== nextClientId) {
      throw new BadRequestException(
        'La granja seleccionada no pertenece al productor indicado.',
      );
    }

    await this.ensureClientBelongsToOrganization(nextClientId, organizationId);
    await this.ensureAdvisorBelongsToOrganization(nextAdvisorId, organizationId);

    if (nextCaseId) {
      const linkedCase = await this.ensureCaseContext(nextCaseId, organizationId);
      this.assertCaseMatchesVisit(linkedCase, nextClientId, nextFarmId);
    }

    const updated = await this.prisma.technicalVisit.update({
      where: { id },
      data: {
        ...(dto.caseId !== undefined ? { caseId: nextCaseId } : {}),
        ...(dto.clientId !== undefined ? { clientId: nextClientId } : {}),
        ...(dto.farmId !== undefined ? { farmId: nextFarmId } : {}),
        ...(dto.advisorId !== undefined ? { advisorId: nextAdvisorId } : {}),
        ...(dto.visitDate !== undefined ? { visitDate: new Date(dto.visitDate) } : {}),
        ...this.buildSpeciesMetrics(
          {
            birdCount:
              dto.birdCount !== undefined ? dto.birdCount : existingVisit.birdCount ?? undefined,
            mortalityCount:
              dto.mortalityCount !== undefined
                ? dto.mortalityCount
                : existingVisit.mortalityCount ?? undefined,
            feedConversion:
              dto.feedConversion !== undefined
                ? dto.feedConversion
                : existingVisit.feedConversion ?? undefined,
            avgBodyWeight:
              dto.avgBodyWeight !== undefined
                ? dto.avgBodyWeight
                : existingVisit.avgBodyWeight ?? undefined,
            animalCount:
              dto.animalCount !== undefined
                ? dto.animalCount
                : existingVisit.animalCount ?? undefined,
            dailyWeightGain:
              dto.dailyWeightGain !== undefined
                ? dto.dailyWeightGain
                : existingVisit.dailyWeightGain ?? undefined,
            feedConsumption:
              dto.feedConsumption !== undefined
                ? dto.feedConsumption
                : existingVisit.feedConsumption ?? undefined,
          },
          farm.speciesType,
        ),
        ...(dto.observations !== undefined
          ? { observations: this.cleanOptional(dto.observations) }
          : {}),
        ...(dto.recommendations !== undefined
          ? { recommendations: this.cleanOptional(dto.recommendations) }
          : {}),
      },
      include: this.visitInclude(),
    });

    return this.serializeVisit(updated);
  }

  async findByFarm(user: AuthUser, farmId: string) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    await this.ensureFarmContext(farmId, organizationId, scopedClientId);

    const visits = await this.prisma.technicalVisit.findMany({
      where: {
        organizationId,
        farmId,
        ...(scopedClientId ? { clientId: scopedClientId } : {}),
      },
      include: this.visitInclude(),
      orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
    });

    return visits.map((visit) => this.serializeVisit(visit));
  }

  private visitInclude() {
    return {
      client: {
        select: {
          id: true,
          fullName: true,
          companyName: true,
          status: true,
        },
      },
      farm: {
        select: {
          id: true,
          name: true,
          speciesType: true,
          location: true,
          capacity: true,
        },
      },
      case: {
        select: {
          id: true,
          caseNumber: true,
          title: true,
          status: true,
          severity: true,
        },
      },
    } satisfies Prisma.TechnicalVisitInclude;
  }

  private serializeVisit(visit: Prisma.TechnicalVisitGetPayload<{ include: ReturnType<VisitsService['visitInclude']> }>) {
    return {
      ...visit,
      speciesMetrics:
        visit.farm.speciesType === 'swine'
          ? {
              animalCount: visit.animalCount,
              dailyWeightGain: visit.dailyWeightGain,
              feedConsumption: visit.feedConsumption,
            }
          : {
              birdCount: visit.birdCount,
              mortalityCount: visit.mortalityCount,
              feedConversion: visit.feedConversion,
              avgBodyWeight: visit.avgBodyWeight,
            },
    };
  }

  private buildSpeciesMetrics(
    dto: Pick<
      CreateVisitDto,
      | 'birdCount'
      | 'mortalityCount'
      | 'feedConversion'
      | 'avgBodyWeight'
      | 'animalCount'
      | 'dailyWeightGain'
      | 'feedConsumption'
    >,
    speciesType: string,
  ) {
    if (speciesType === 'swine') {
      return {
        birdCount: null,
        mortalityCount: null,
        feedConversion: null,
        avgBodyWeight: null,
        animalCount: dto.animalCount ?? null,
        dailyWeightGain: dto.dailyWeightGain ?? null,
        feedConsumption: dto.feedConsumption ?? null,
      };
    }

    return {
      birdCount: dto.birdCount ?? null,
      mortalityCount: dto.mortalityCount ?? null,
      feedConversion: dto.feedConversion ?? null,
      avgBodyWeight: dto.avgBodyWeight ?? null,
      animalCount: null,
      dailyWeightGain: null,
      feedConsumption: null,
    };
  }

  private assertCaseMatchesVisit(
    caseRecord: CaseContext,
    clientId: string,
    farmId: string,
  ) {
    if (caseRecord.clientId !== clientId) {
      throw new BadRequestException(
        'El caso seleccionado no pertenece al productor indicado.',
      );
    }

    if (caseRecord.farmId && caseRecord.farmId !== farmId) {
      throw new BadRequestException(
        'El caso seleccionado no pertenece a la granja indicada.',
      );
    }
  }

  private async ensureVisitBelongsToOrganization(
    id: string,
    organizationId: string,
    clientId?: string | null,
  ) {
    const visit = await this.prisma.technicalVisit.findFirst({
      where: {
        id,
        organizationId,
        ...(clientId ? { clientId } : {}),
      },
    });

    if (!visit) {
      throw new NotFoundException('Visita no encontrada');
    }

    return visit;
  }

  private async ensureClientBelongsToOrganization(
    clientId: string,
    organizationId: string,
  ) {
    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        organizationId,
      },
      select: { id: true },
    });

    if (!client) {
      throw new BadRequestException(
        'El productor seleccionado no existe o no pertenece a la organización.',
      );
    }
  }

  private async ensureFarmContext(
    id: string,
    organizationId: string,
    clientId?: string | null,
  ): Promise<FarmContext> {
    const farm = await this.prisma.farm.findFirst({
      where: {
        id,
        organizationId,
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true,
        clientId: true,
        speciesType: true,
        name: true,
      },
    });

    if (!farm) {
      throw new BadRequestException(
        'La granja seleccionada no existe o no pertenece a la organización.',
      );
    }

    return farm;
  }

  private async ensureCaseContext(id: string, organizationId: string): Promise<CaseContext> {
    const caseRecord = await this.prisma.case.findFirst({
      where: {
        id,
        organizationId,
      },
      select: {
        id: true,
        clientId: true,
        farmId: true,
        caseNumber: true,
        title: true,
        status: true,
      },
    });

    if (!caseRecord) {
      throw new BadRequestException(
        'El caso seleccionado no existe o no pertenece a la organización.',
      );
    }

    return caseRecord;
  }

  private async ensureAdvisorBelongsToOrganization(
    advisorId: string,
    organizationId: string,
  ) {
    const advisor = await this.prisma.profile.findFirst({
      where: {
        id: advisorId,
        organizationId,
        role: {
          in: ['admin', 'asesor_tecnico', 'asesor_comercial'],
        },
      },
      select: { id: true },
    });

    if (!advisor) {
      throw new BadRequestException(
        'El asesor seleccionado no existe o no pertenece a la organización.',
      );
    }
  }

  private requireOrganizationId(user: AuthUser) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'El usuario autenticado no tiene organización asignada.',
      );
    }

    return user.organizationId;
  }

  private getScopedClientId(user: AuthUser) {
    if (user.role !== 'cliente') {
      return null;
    }

    if (!user.clientId) {
      throw new ForbiddenException(
        'El productor autenticado no tiene una relación de propiedad válida.',
      );
    }

    return user.clientId;
  }

  private resolveMutationClientId(user: AuthUser, requestedClientId?: string) {
    const scopedClientId = this.getScopedClientId(user);
    if (!scopedClientId) {
      if (!requestedClientId) {
        throw new BadRequestException('Debe indicar el productor asociado a la visita.');
      }

      return requestedClientId;
    }

    if (requestedClientId && requestedClientId !== scopedClientId) {
      throw new ForbiddenException(
        'No puedes crear o reasignar visitas a otro productor.',
      );
    }

    return scopedClientId;
  }

  private cleanOptional(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
