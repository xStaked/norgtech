import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AUTH_JWT_SECRET } from "./auth.constants";

type BcryptModule = {
  compare(value: string, hash: string): Promise<boolean>;
};

type JsonWebTokenModule = {
  sign(
    payload: Record<string, unknown>,
    secret: string,
    options: { expiresIn: string },
  ): string;
};

const bcrypt = require("bcryptjs") as BcryptModule;
const jsonwebtoken = require("jsonwebtoken") as JsonWebTokenModule;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return {
      accessToken: jsonwebtoken.sign(
        {
          sub: user.id,
          role: user.role,
          email: user.email,
        },
        AUTH_JWT_SECRET,
        { expiresIn: "1h" },
      ),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
