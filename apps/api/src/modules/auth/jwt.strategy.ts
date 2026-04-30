import { Injectable, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AUTH_JWT_SECRET } from "./auth.constants";
import { AuthenticatedUser } from "./types/authenticated-request";

type JsonWebTokenModule = {
  verify(token: string, secret: string): {
    sub: string;
    email: string;
    role: UserRole;
  };
};

const jsonwebtoken = require("jsonwebtoken") as JsonWebTokenModule;

@Injectable()
export class JwtStrategy {
  verify(accessToken: string): AuthenticatedUser {
    try {
      const payload = jsonwebtoken.verify(accessToken, AUTH_JWT_SECRET);

      if (!this.isAuthenticatedUser(payload)) {
        throw new UnauthorizedException("Invalid token");
      }

      return payload;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }

  private isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
    if (!value || typeof value !== "object") {
      return false;
    }

    const payload = value as Partial<AuthenticatedUser>;

    return (
      typeof payload.sub === "string" &&
      typeof payload.email === "string" &&
      this.isUserRole(payload.role)
    );
  }

  private isUserRole(role: unknown): role is UserRole {
    return typeof role === "string" && Object.values(UserRole).includes(role as UserRole);
  }
}
