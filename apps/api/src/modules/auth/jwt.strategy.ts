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
      return jsonwebtoken.verify(accessToken, AUTH_JWT_SECRET);
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
