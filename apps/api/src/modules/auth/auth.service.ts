import { BadRequestException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AUTH_JWT_SECRET } from "./auth.constants";
import { sendPasswordResetEmail } from "./password-reset-email";
import type { UserRole } from "@prisma/client";

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PASSWORD_RESET_TTL_MINUTES = 30;

type BcryptModule = {
  compare(value: string, hash: string): Promise<boolean>;
  hash(value: string, rounds: number): Promise<string>;
};

type JsonWebTokenModule = {
  sign(
    payload: Record<string, unknown>,
    secret: string,
    options: { expiresIn: string },
  ): string;
  verify(token: string, secret: string): unknown;
};

const bcrypt = require("bcryptjs") as BcryptModule;
const jsonwebtoken = require("jsonwebtoken") as JsonWebTokenModule;
const crypto = require("crypto");

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  private signAccess(user: { id: string; role: UserRole; email: string }): string {
    return jsonwebtoken.sign(
      { sub: user.id, role: user.role, email: user.email },
      AUTH_JWT_SECRET,
      { expiresIn: "15m" },
    );
  }

  private hashToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  async issueRefresh(userId: string): Promise<string> {
    const raw = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(raw), expiresAt },
    });
    return raw;
  }

  async refresh(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawRefreshToken) },
    });

    if (!record || record.revokedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException("Sesión expirada");
    }

    // Rotation: revoke the presented token BEFORE issuing a new one, so a
    // reused (already-rotated) token can never mint a fresh pair.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || !user.active) {
      throw new UnauthorizedException("Sesión expirada");
    }

    return {
      accessToken: this.signAccess(user),
      refreshToken: await this.issueRefresh(user.id),
    };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const refreshToken = await this.issueRefresh(user.id);

    return {
      accessToken: this.signAccess(user),
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Siempre resuelve sin error: el endpoint no debe revelar si el correo existe.
   * Un fallo de Resend se registra pero no se propaga al cliente.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return;
    }

    const raw = crypto.randomBytes(32).toString("hex");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
      },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    try {
      await sendPasswordResetEmail({
        name: user.name,
        email: user.email,
        resetUrl: `${frontendUrl}/restablecer?token=${raw}`,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      });
    } catch (error) {
      this.logger.error(`No se pudo enviar el correo de recuperación: ${String(error)}`);
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });

    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException("El enlace es inválido o ya expiró");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      // Reclamar el token primero: si dos peticiones llegan con el mismo token
      // solo una encuentra usedAt=null, y la otra aborta sin tocar la clave.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new BadRequestException("El enlace es inválido o ya expiró");
      }

      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });

      // Cerrar las sesiones abiertas: quien haya robado la cuenta pierde acceso.
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      throw new UnauthorizedException("User not found");
    }
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async mintScopedToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      throw new UnauthorizedException("Cannot mint token for user");
    }
    return jsonwebtoken.sign(
      { sub: user.id, role: user.role, email: user.email },
      AUTH_JWT_SECRET,
      { expiresIn: "10m" },
    );
  }
}
