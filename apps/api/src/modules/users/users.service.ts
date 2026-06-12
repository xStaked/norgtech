import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

type BcryptModule = {
  hash(value: string, rounds: number): Promise<string>;
};

const bcrypt = require("bcryptjs") as BcryptModule;

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      orderBy: { name: "asc" },
      select: publicUserSelect,
    });
  }

  async create(dto: CreateUserDto) {
    const email = this.normalizeEmail(dto.email);
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          role: dto.role,
          active: true,
        },
        select: publicUserSelect,
      });

      return {
        user,
        temporaryPassword,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("Email already exists");
      }

      throw error;
    }
  }

  async update(currentUser: AuthUser, id: string, dto: UpdateUserDto): Promise<PublicUser> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("User not found");
    }

    if (currentUser.id === id && dto.role !== undefined) {
      throw new BadRequestException("You cannot change your own role");
    }

    if (currentUser.id === id && dto.active === false) {
      throw new BadRequestException("You cannot deactivate your own user");
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      select: publicUserSelect,
    });

    return user;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private generateTemporaryPassword() {
    return `Nt-${randomBytes(9).toString("base64url")}`;
  }
  private isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
