import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AUTH_JWT_SECRET } from "./auth.constants";
import type { UserRole } from "@prisma/client";

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type BcryptModule = {
  compare(value: string, hash: string): Promise<boolean>;
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
