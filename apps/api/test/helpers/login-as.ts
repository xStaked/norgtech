import { INestApplication } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import request from "supertest";

export const ALL_ROLES: UserRole[] = [
  UserRole.administrador,
  UserRole.director_comercial,
  UserRole.comercial,
  UserRole.tecnico,
  UserRole.facturacion,
  UserRole.logistica,
];

const SEED_CREDENTIALS: Record<UserRole, { email: string; password: string }> = {
  [UserRole.administrador]: { email: "admin@norgtech.com", password: "Admin123!" },
  [UserRole.director_comercial]: { email: "director@norgtech.com", password: "Director123!" },
  [UserRole.comercial]: { email: "comercial@norgtech.com", password: "Comercial123!" },
  [UserRole.tecnico]: { email: "tecnico@norgtech.com", password: "Tecnico123!" },
  [UserRole.facturacion]: { email: "facturacion@norgtech.com", password: "Facturacion123!" },
  [UserRole.logistica]: { email: "logistica@norgtech.com", password: "Logistica123!" },
};

export async function loginAs(
  app: INestApplication,
  role: UserRole,
): Promise<string> {
  const { email, password } = SEED_CREDENTIALS[role];

  const response = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email, password })
    .expect(200);

  return response.body.accessToken as string;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
