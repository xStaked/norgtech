import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthUser } from "../auth/types/authenticated-request";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { SELLER_ROLES } from "../seller-goals/seller-eligibility";

type BcryptModule = {
  hash(value: string, rounds: number): Promise<string>;
};

const bcrypt = require("bcryptjs") as BcryptModule;

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: "asc" },
      select: publicUserSelect,
    });
  }

  /**
   * Vendedores elegibles para el selector "Vendedor" del formulario de pedido
   * (GOAL-02). Endpoint aparte de `findAll` a proposito: `GET /users` es solo
   * para administrador, y un comercial creando un pedido necesita la lista.
   * Se expone id+name y nada mas, en vez de ampliar los roles de `findAll` y
   * filtrar cada usuario y cada campo a mas gente.
   */
  async findSellers(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.user.findMany({
      where: { active: true, role: { in: SELLER_ROLES } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }

  /**
   * Usuarios asignables en la seccion Logistica del pedido. Mismo motivo que
   * `findSellers`: logistica no puede llamar `GET /users`. No se reusa el
   * selector de vendedores porque ahi solo hay comercial/director_comercial,
   * que no son quienes despachan.
   */
  async findLogisticsUsers(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.user.findMany({
      where: { active: true, role: { in: ["logistica", "administrador"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
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
          phone: dto.phone.trim(),
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
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      select: publicUserSelect,
    });

    return user;
  }

  /**
   * Borra un usuario de verdad, pero solo si no dejo rastro en el CRM. Quien ya
   * vendio, visito o cargo un soporte se desactiva: borrarlo dejaria pedidos sin
   * vendedor y reportes sin autor.
   */
  async remove(currentUser: AuthUser, id: string): Promise<{ id: string; name: string }> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (currentUser.id === id) {
      throw new BadRequestException("You cannot delete your own user");
    }

    const history = await this.findHistory(id);
    if (history.length > 0) {
      throw new ConflictException(
        `${user.name} tiene historial en el CRM (${history.join(", ")}). Desactivalo en vez de eliminarlo para no perder esos registros.`,
      );
    }

    await this.prisma.user.delete({ where: { id } });

    return { id: user.id, name: user.name };
  }

  /**
   * Todo lo que se perderia al borrar al usuario, ya sea porque la llave foranea
   * lo pone en NULL (pedidos sin vendedor) o porque arrastra el registro
   * completo (metas). Visit y Quote se cuentan a mano: guardan el id del usuario
   * como texto, sin llave foranea, asi que la base no avisaria nada y quedarian
   * apuntando a un usuario que ya no existe.
   */
  private async findHistory(userId: string): Promise<string[]> {
    const checks: Array<[string, Promise<number>]> = [
      ["clientes asignados", this.prisma.customer.count({ where: { assignedToUserId: userId } })],
      [
        "pedidos",
        this.prisma.order.count({
          where: { OR: [{ sellerUserId: userId }, { assignedLogisticsUserId: userId }] },
        }),
      ],
      ["visitas", this.prisma.visit.count({ where: { assignedToUserId: userId } })],
      ["cotizaciones", this.prisma.quote.count({ where: { createdBy: userId } })],
      [
        "gastos comerciales",
        this.prisma.commercialExpense.count({
          where: { OR: [{ submittedByUserId: userId }, { reviewedByUserId: userId }] },
        }),
      ],
      [
        "soportes de gasto",
        this.prisma.commercialExpenseSupport.count({ where: { uploadedByUserId: userId } }),
      ],
      ["soportes de pago", this.prisma.paymentSupport.count({ where: { uploadedByUserId: userId } })],
      ["reportes ejecutivos", this.prisma.executiveReport.count({ where: { createdBy: userId } })],
      ["metas de venta", this.prisma.sellerGoal.count({ where: { userId } })],
      [
        "conversaciones de WhatsApp",
        this.prisma.whatsAppConversation.count({ where: { assignedToUserId: userId } }),
      ],
      [
        "mensajes de WhatsApp",
        this.prisma.whatsAppMessage.count({ where: { authorUserId: userId } }),
      ],
      ["notas internas", this.prisma.whatsAppInternalNote.count({ where: { authorUserId: userId } })],
      ["zonas asignadas", this.prisma.customerZone.count({ where: { assignedToUserId: userId } })],
    ];

    const counts = await Promise.all(checks.map(([, count]) => count));

    return checks
      .map(([label], index) => ({ label, count: counts[index] }))
      .filter(({ count }) => count > 0)
      .map(({ label, count }) => `${count} ${label}`);
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
