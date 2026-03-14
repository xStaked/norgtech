import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AddCaseMessageDto } from './dto/add-case-message.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { ListCasesQueryDto } from './dto/list-cases-query.dto';
import { UpdateCaseDto } from './dto/update-case.dto';

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser, query: ListCasesQueryDto) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.CaseWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.assignedTechId ? { assignedTechId: query.assignedTechId } : {}),
      ...(scopedClientId || query.clientId
        ? { clientId: scopedClientId ?? query.clientId }
        : {}),
      ...(query.farmId ? { farmId: query.farmId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.case.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          client: {
            select: {
              id: true,
              fullName: true,
              companyName: true,
            },
          },
          farm: {
            select: {
              id: true,
              name: true,
              speciesType: true,
            },
          },
          _count: {
            select: {
              messages: true,
              visits: true,
            },
          },
        },
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      items: items.map((item) => this.serializeCase(item)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async create(user: AuthUser, dto: CreateCaseDto) {
    const organizationId = this.requireOrganizationId(user);
    const clientId = this.resolveMutationClientId(user, dto.clientId);
    await this.ensureClientBelongsToOrganization(clientId, organizationId);

    if (dto.farmId) {
      await this.ensureFarmBelongsToOrganization(dto.farmId, organizationId, clientId);
    }

    const created = await this.prisma.case.create({
      data: {
        organizationId,
        clientId,
        farmId: this.cleanOptional(dto.farmId),
        title: dto.title.trim(),
        description: this.cleanOptional(dto.description),
        severity: dto.severity,
        assignedTechId: this.cleanOptional(dto.assignedTechId),
      },
      include: {
        client: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
          },
        },
        farm: {
          select: {
            id: true,
            name: true,
            speciesType: true,
          },
        },
        _count: {
          select: {
            messages: true,
            visits: true,
          },
        },
      },
    });

    return this.serializeCase(created);
  }

  async findOne(user: AuthUser, id: string) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const caseRecord = await this.prisma.case.findFirst({
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
        farm: {
          select: {
            id: true,
            name: true,
            speciesType: true,
            location: true,
            capacity: true,
          },
        },
        visits: {
          orderBy: [{ visitDate: 'desc' }],
          take: 10,
          select: {
            id: true,
            visitDate: true,
            advisorId: true,
            observations: true,
            recommendations: true,
          },
        },
        messages: {
          orderBy: [{ createdAt: 'asc' }],
        },
        _count: {
          select: {
            messages: true,
            visits: true,
          },
        },
      },
    });

    if (!caseRecord) {
      throw new NotFoundException('Caso no encontrado');
    }

    const profileIds = Array.from(
      new Set(caseRecord.messages.map((message) => message.userId).filter(Boolean)),
    );

    const profiles = profileIds.length
      ? await this.prisma.profile.findMany({
          where: {
            id: { in: profileIds },
          },
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        })
      : [];

    const profilesMap = new Map(profiles.map((profile) => [profile.id, profile]));

    return {
      ...this.serializeCase(caseRecord),
      messages: caseRecord.messages.map((message) => ({
        ...message,
        author: profilesMap.get(message.userId) ?? null,
      })),
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateCaseDto) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const existingCase = await this.ensureCaseBelongsToOrganization(
      id,
      organizationId,
      scopedClientId,
    );

    const nextClientId =
      dto.clientId !== undefined
        ? this.resolveMutationClientId(user, dto.clientId)
        : existingCase.clientId;
    const nextFarmId =
      dto.farmId !== undefined ? this.cleanOptional(dto.farmId) : existingCase.farmId;

    await this.ensureClientBelongsToOrganization(nextClientId, organizationId);

    if (nextFarmId) {
      await this.ensureFarmBelongsToOrganization(nextFarmId, organizationId, nextClientId);
    }

    const statusChanged = dto.status !== undefined && dto.status !== existingCase.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const caseRecord = await tx.case.update({
        where: { id },
        data: {
          ...(dto.clientId !== undefined || nextClientId !== existingCase.clientId
            ? { clientId: nextClientId }
            : {}),
          ...(dto.farmId !== undefined ? { farmId: nextFarmId } : {}),
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: this.cleanOptional(dto.description) }
            : {}),
          ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
          ...(dto.assignedTechId !== undefined
            ? { assignedTechId: this.cleanOptional(dto.assignedTechId) }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(statusChanged
            ? {
                closedAt: dto.status === 'closed' ? new Date() : null,
              }
            : {}),
        },
        include: {
          client: {
            select: {
              id: true,
              fullName: true,
              companyName: true,
            },
          },
          farm: {
            select: {
              id: true,
              name: true,
              speciesType: true,
            },
          },
          _count: {
            select: {
              messages: true,
              visits: true,
            },
          },
        },
      });

      if (statusChanged) {
        await tx.caseMessage.create({
          data: {
            caseId: id,
            userId: user.id,
            messageType: 'status_change',
            content: `Estado actualizado de ${existingCase.status} a ${dto.status}.`,
          },
        });
      }

      return caseRecord;
    });

    return this.serializeCase(updated);
  }

  async addMessage(user: AuthUser, id: string, dto: AddCaseMessageDto) {
    const organizationId = this.requireOrganizationId(user);
    await this.ensureCaseBelongsToOrganization(
      id,
      organizationId,
      this.getScopedClientId(user),
    );

    return this.prisma.caseMessage.create({
      data: {
        caseId: id,
        userId: user.id,
        content: dto.content.trim(),
        messageType: dto.messageType,
      },
    });
  }

  async getStats(user: AuthUser) {
    const organizationId = this.requireOrganizationId(user);
    const scopedClientId = this.getScopedClientId(user);
    const grouped = await this.prisma.case.groupBy({
      by: ['status'],
      where: {
        organizationId,
        ...(scopedClientId ? { clientId: scopedClientId } : {}),
      },
      _count: {
        status: true,
      },
    });

    const counts = {
      open: 0,
      in_analysis: 0,
      treatment: 0,
      waiting_client: 0,
      closed: 0,
    };

    for (const row of grouped) {
      if (row.status in counts) {
        counts[row.status as keyof typeof counts] = row._count.status;
      }
    }

    return {
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      byStatus: counts,
    };
  }

  private serializeCase<T extends { caseNumber: number }>(caseRecord: T) {
    return {
      ...caseRecord,
      displayCaseNumber: this.formatCaseNumber(caseRecord.caseNumber),
    };
  }

  private formatCaseNumber(caseNumber: number) {
    return `CASO-${String(caseNumber).padStart(4, '0')}`;
  }

  private async ensureCaseBelongsToOrganization(
    id: string,
    organizationId: string,
    clientId?: string | null,
  ) {
    const caseRecord = await this.prisma.case.findFirst({
      where: {
        id,
        organizationId,
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true,
        organizationId: true,
        clientId: true,
        farmId: true,
        status: true,
      },
    });

    if (!caseRecord) {
      throw new NotFoundException('Caso no encontrado');
    }

    return caseRecord;
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
      throw new BadRequestException('El productor no pertenece a la organización');
    }
  }

  private async ensureFarmBelongsToOrganization(
    farmId: string,
    organizationId: string,
    clientId?: string,
  ) {
    const farm = await this.prisma.farm.findFirst({
      where: {
        id: farmId,
        organizationId,
      },
      select: {
        id: true,
        clientId: true,
      },
    });

    if (!farm) {
      throw new BadRequestException('La granja no pertenece a la organización');
    }

    if (clientId && farm.clientId !== clientId) {
      throw new ForbiddenException('La granja indicada no pertenece al productor');
    }
  }

  private cleanOptional(value?: string | null) {
    if (value === undefined || value === null) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private requireOrganizationId(user: AuthUser) {
    if (!user.organizationId) {
      throw new ForbiddenException(
        'El usuario autenticado no tiene organización asignada',
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
        throw new BadRequestException('Debe indicar el productor asociado al caso.');
      }

      return requestedClientId;
    }

    if (requestedClientId && requestedClientId !== scopedClientId) {
      throw new ForbiddenException(
        'No puedes crear o reasignar casos a otro productor.',
      );
    }

    return scopedClientId;
  }
}
