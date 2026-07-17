import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateZoneDto } from "./dto/create-zone.dto";
import { UpdateZoneDto } from "./dto/update-zone.dto";

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateZoneDto) {
    return this.prisma.zone.create({
      data: { name: dto.name, department: dto.department },
    });
  }

  findAll(includeInactive = false) {
    return this.prisma.zone.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException("Zone not found");
    return zone;
  }

  async update(id: string, dto: UpdateZoneDto) {
    await this.findOne(id);
    if (dto.name) {
      const existing = await this.prisma.zone.findUnique({ where: { name: dto.name } });
      if (existing && existing.id !== id) {
        throw new BadRequestException("Zone name already in use");
      }
    }
    return this.prisma.zone.update({ where: { id }, data: dto });
  }
}
