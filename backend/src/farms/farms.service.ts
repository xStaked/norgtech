import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { ListFarmsQueryDto } from './dto/list-farms-query.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';

@Injectable()
export class FarmsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListFarmsQueryDto) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = await this.resolveScopedClientId(user, organizationId);

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
    await this.ensureClientBelongsToOrganization(dto.clientId, organizationId);

    return this.prisma.farm.create({
      data: {
        organizationId,
        clientId: dto.clientId,
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
    const scopedClientId = await this.resolveScopedClientId(user, organizationId);
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
    await this.ensureFarmBelongsToOrganization(id, organizationId);

    if (dto.clientId) {
      await this.ensureClientBelongsToOrganization(dto.clientId, organizationId);
    }

    return this.prisma.farm.update({
      where: { id },
      data: {
        ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
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

  async getStats(user: AuthUser, id: string) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = await this.resolveScopedClientId(user, organizationId);
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

  private requireOrganizationId(user: AuthUser) {
    if (!user.organizationId) {
      throw new ForbiddenException(
        'El usuario autenticado no tiene organización asociada',
      );
    }

    return user.organizationId;
  }

  private async resolveScopedClientId(user: AuthUser, organizationId: string) {
    if (user.role !== 'cliente') {
      return null;
    }

    const email = user.email?.trim().toLowerCase();
    if (email) {
      const client = await this.prisma.client.findFirst({
        where: {
          organizationId,
          email,
          status: 'active',
        },
        select: {
          id: true,
        },
      });

      if (client) {
        return client.id;
      }
    }

    const activeClients = await this.prisma.client.findMany({
      where: {
        organizationId,
        status: 'active',
      },
      select: {
        id: true,
      },
      take: 2,
    });

    if (activeClients.length === 1) {
      return activeClients[0].id;
    }

    throw new ForbiddenException(
      'No existe un productor activo asociado al usuario autenticado',
    );
  }

  private cleanOptional(value?: string | null) {
    if (value === undefined || value === null) return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
