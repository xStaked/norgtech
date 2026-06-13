import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCompanyDto) {
    return this.prisma.company.create({
      data: {
        name: dto.name,
        legalName: dto.legalName,
        nit: dto.nit,
        prefix: dto.prefix.toUpperCase(),
      },
    });
  }

  findAll() {
    return this.prisma.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException("Company not found");
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id);

    if (dto.prefix) {
      const existing = await this.prisma.company.findUnique({
        where: { prefix: dto.prefix.toUpperCase() },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException("Prefix already in use");
      }
    }

    return this.prisma.company.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.prefix ? { prefix: dto.prefix.toUpperCase() } : {}),
      },
    });
  }
}
