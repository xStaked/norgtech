import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { CreateOperatingUnitDto } from './dto/create-operating-unit.dto';
import { CreateProducerFarmDto } from './dto/create-producer-farm.dto';
import { ListFarmsQueryDto } from './dto/list-farms-query.dto';
import { ListProducerFarmsQueryDto } from './dto/list-producer-farms-query.dto';
import { ListProducerOperatingUnitsQueryDto } from './dto/list-producer-operating-units-query.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { UpdateOperatingUnitDto } from './dto/update-operating-unit.dto';
import { UpdateProducerFarmDto } from './dto/update-producer-farm.dto';

@Injectable()
export class FarmsService {
  constructor(private readonly prisma: PrismaService) {}

  async findProducerFarms(user: AuthUser, query: ListProducerFarmsQueryDto) {
    const organizationId = this.requireOrganizationId(user);
    const clientId = this.getScopedClientId(user);

    const items = await this.prisma.farm.findMany({
      where: {
        organizationId,
        clientId,
        ...(query.speciesType ? { speciesType: query.speciesType } : {}),
      },
      include: this.getProducerFarmInclude(),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });

    return {
      items,
      meta: {
        total: items.length,
        filters: query,
      },
    };
  }

  async createProducerFarm(user: AuthUser, dto: CreateProducerFarmDto) {
    return this.create(user, {
      ...dto,
      clientId: this.getScopedClientId(user),
    });
  }

  async findProducerFarm(user: AuthUser, id: string) {
    const farm = await this.findOne(user, id);
    const operatingUnits = await this.prisma.operatingUnit.findMany({
      where: {
        organizationId: farm.organizationId,
        clientId: farm.clientId,
        farmId: farm.id,
      },
      include: this.getProducerOperatingUnitInclude(),
      orderBy: [{ updatedAt: 'desc' }, { displayName: 'asc' }, { name: 'asc' }],
    });

    return {
      ...farm,
      operatingUnits,
    };
  }

  async updateProducerFarm(user: AuthUser, id: string, dto: UpdateProducerFarmDto) {
    return this.update(user, id, dto);
  }

  async listProducerOperatingUnits(
    user: AuthUser,
    query: ListProducerOperatingUnitsQueryDto,
  ) {
    const organizationId = this.requireOrganizationId(user);
    const clientId = this.getScopedClientId(user);

    if (query.farmId) {
      await this.ensureFarmBelongsToOrganization(query.farmId, organizationId, clientId);
    }

    const items = await this.prisma.operatingUnit.findMany({
      where: {
        organizationId,
        clientId,
        ...(query.farmId ? { farmId: query.farmId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: this.getProducerOperatingUnitInclude(),
      orderBy: [{ updatedAt: 'desc' }, { displayName: 'asc' }, { name: 'asc' }],
    });

    return {
      items,
      meta: {
        total: items.length,
        filters: query,
      },
    };
  }

  async createProducerOperatingUnit(user: AuthUser, dto: CreateOperatingUnitDto) {
    const organizationId = this.requireOrganizationId(user);
    const clientId = this.getScopedClientId(user);
    const farm = await this.ensureFarmBelongsToOrganization(dto.farmId, organizationId, clientId);

    return this.prisma.operatingUnit.create({
      data: {
        organizationId,
        clientId,
        farmId: farm.id,
        name: dto.name.trim(),
        displayName: this.cleanOptional(dto.displayName),
        speciesType: farm.speciesType,
        unitType: this.cleanOptional(dto.unitType),
        capacity: dto.capacity,
        status: dto.status ?? 'active',
        ...(dto.metadata !== undefined
          ? { metadata: dto.metadata as Prisma.InputJsonValue }
          : {}),
      },
      include: this.getProducerOperatingUnitInclude(),
    });
  }

  async findProducerOperatingUnit(user: AuthUser, id: string) {
    const organizationId = this.requireOrganizationId(user);
    const clientId = this.getScopedClientId(user);

    const operatingUnit = await this.prisma.operatingUnit.findFirst({
      where: {
        id,
        organizationId,
        clientId,
      },
      include: {
        ...this.getProducerOperatingUnitInclude(),
        visits: {
          orderBy: [{ visitDate: 'desc' }],
          take: 10,
        },
      },
    });

    if (!operatingUnit) {
      throw new NotFoundException('Unidad operativa no encontrada');
    }

    return operatingUnit;
  }

  async updateProducerOperatingUnit(
    user: AuthUser,
    id: string,
    dto: UpdateOperatingUnitDto,
  ) {
    const organizationId = this.requireOrganizationId(user);
    const clientId = this.getScopedClientId(user);
    const operatingUnit = await this.ensureOperatingUnitBelongsToOrganization(
      id,
      organizationId,
      clientId,
    );

    await this.ensureFarmBelongsToOrganization(
      operatingUnit.farmId,
      organizationId,
      clientId,
    );

    return this.prisma.operatingUnit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.displayName !== undefined
          ? { displayName: this.cleanOptional(dto.displayName) }
          : {}),
        ...(dto.unitType !== undefined ? { unitType: this.cleanOptional(dto.unitType) } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.metadata !== undefined
          ? { metadata: dto.metadata as Prisma.InputJsonValue }
          : {}),
      },
      include: this.getProducerOperatingUnitInclude(),
    });
  }

  async findAll(user: AuthUser, query: ListFarmsQueryDto) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);

    const items = await this.prisma.farm.findMany({
      where: {
        organizationId,
        ...(scopedClientId || query.clientId
          ? { clientId: scopedClientId ?? query.clientId }
          : {}),
        ...(query.speciesType ? { speciesType: query.speciesType } : {}),
        ...(query.advisorId ? { assignedAdvisorId: query.advisorId } : {}),
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            phone: true,
            email: true,
          },
        },
        _count: {
          select: {
            visits: true,
            cases: true,
            fcaCalcs: true,
            roiCalcs: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });

    return {
      items,
      meta: {
        total: items.length,
        filters: query,
      },
    };
  }

  async create(user: AuthUser, dto: CreateFarmDto) {
    const organizationId = this.requireOrganizationId(user);
    const clientId = this.resolveMutationClientId(user, dto.clientId);
    await this.ensureClientBelongsToOrganization(clientId, organizationId);

    return this.prisma.farm.create({
      data: {
        organizationId,
        clientId,
        name: dto.name.trim(),
        speciesType: dto.speciesType,
        location: this.cleanOptional(dto.location),
        capacity: dto.capacity,
        assignedAdvisorId: this.cleanOptional(dto.assignedAdvisorId),
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            phone: true,
            email: true,
          },
        },
        _count: {
          select: {
            visits: true,
            cases: true,
            fcaCalcs: true,
            roiCalcs: true,
          },
        },
      },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const farm = await this.prisma.farm.findFirst({
      where: {
        id,
        organizationId,
        ...(scopedClientId ? { clientId: scopedClientId } : {}),
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            phone: true,
            email: true,
            address: true,
            status: true,
          },
        },
        visits: {
          orderBy: [{ visitDate: 'desc' }],
          take: 10,
        },
        _count: {
          select: {
            visits: true,
            cases: true,
            fcaCalcs: true,
            roiCalcs: true,
          },
        },
      },
    });

    if (!farm) {
      throw new NotFoundException('Granja no encontrada');
    }

    return farm;
  }

  async update(user: AuthUser, id: string, dto: UpdateFarmDto) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const existingFarm = await this.ensureFarmBelongsToOrganization(
      id,
      organizationId,
      scopedClientId,
    );
    const nextClientId =
      dto.clientId !== undefined
        ? this.resolveMutationClientId(user, dto.clientId)
        : existingFarm.clientId;

    await this.ensureClientBelongsToOrganization(nextClientId, organizationId);

    return this.prisma.farm.update({
      where: { id },
      data: {
        ...(dto.clientId !== undefined || nextClientId !== existingFarm.clientId
          ? { clientId: nextClientId }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.speciesType !== undefined ? { speciesType: dto.speciesType } : {}),
        ...(dto.location !== undefined ? { location: this.cleanOptional(dto.location) } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.assignedAdvisorId !== undefined
          ? { assignedAdvisorId: this.cleanOptional(dto.assignedAdvisorId) }
          : {}),
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            phone: true,
            email: true,
          },
        },
        _count: {
          select: {
            visits: true,
            cases: true,
            fcaCalcs: true,
            roiCalcs: true,
          },
        },
      },
    });
  }

  private getProducerFarmInclude() {
    return {
      client: {
        select: {
          id: true,
          fullName: true,
          companyName: true,
          phone: true,
          email: true,
        },
      },
      _count: {
        select: {
          visits: true,
          cases: true,
          operatingUnits: true,
        },
      },
    } satisfies Prisma.FarmInclude;
  }

  private getProducerOperatingUnitInclude() {
    return {
      farm: {
        select: {
          id: true,
          name: true,
          speciesType: true,
        },
      },
      _count: {
        select: {
          visits: true,
          cases: true,
        },
      },
    } satisfies Prisma.OperatingUnitInclude;
  }

  async getStats(user: AuthUser, id: string) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const farm = await this.ensureFarmBelongsToOrganization(id, organizationId, scopedClientId);

    const [openCases, totalCases, totalVisits, lastVisit] =
      await this.prisma.$transaction([
        this.prisma.case.count({
          where: {
            organizationId,
            farmId: id,
            status: {
              not: 'closed',
            },
          },
        }),
        this.prisma.case.count({
          where: {
            organizationId,
            farmId: id,
          },
        }),
        this.prisma.technicalVisit.count({
          where: {
            organizationId,
            farmId: id,
          },
        }),
        this.prisma.technicalVisit.findFirst({
          where: {
            organizationId,
            farmId: id,
          },
          orderBy: {
            visitDate: 'desc',
          },
        }),
      ]);

    return {
      farm: {
        id: farm.id,
        name: farm.name,
        speciesType: farm.speciesType,
        capacity: farm.capacity,
      },
      kpis: {
        totalCases,
        openCases,
        closedCases: totalCases - openCases,
        totalVisits,
        capacity: farm.capacity,
      },
      lastVisit,
    };
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
      select: {
        id: true,
      },
    });

    if (!client) {
      throw new BadRequestException(
        'El productor seleccionado no existe o no pertenece a la organización',
      );
    }
  }

  private async ensureFarmBelongsToOrganization(
    id: string,
    organizationId: string,
    clientId?: string | null,
  ) {
    const farm = await this.prisma.farm.findFirst({
      where: {
        id,
        organizationId,
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true,
        clientId: true,
        name: true,
        speciesType: true,
        capacity: true,
        assignedAdvisorId: true,
      },
    });

    if (!farm) {
      throw new NotFoundException('Granja no encontrada');
    }

    return farm;
  }

  private async ensureOperatingUnitBelongsToOrganization(
    id: string,
    organizationId: string,
    clientId?: string | null,
  ) {
    const operatingUnit = await this.prisma.operatingUnit.findFirst({
      where: {
        id,
        organizationId,
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true,
        farmId: true,
        clientId: true,
        speciesType: true,
        status: true,
      },
    });

    if (!operatingUnit) {
      throw new NotFoundException('Unidad operativa no encontrada');
    }

    return operatingUnit;
  }

  private requireOrganizationId(user: AuthUser) {
    if (!user.organizationId) {
      throw new ForbiddenException(
        'El usuario autenticado no tiene organización asociada',
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
        throw new BadRequestException('Debe indicar el productor asociado a la granja.');
      }

      return requestedClientId;
    }

    if (requestedClientId && requestedClientId !== scopedClientId) {
      throw new ForbiddenException(
        'No puedes crear o reasignar granjas a otro productor.',
      );
    }

    return scopedClientId;
  }

  private cleanOptional(value?: string | null) {
    if (value === undefined || value === null) return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
