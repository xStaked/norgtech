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

/**
 * Uniform password shared by every mock user below. The bcrypt hash matching
 * this plaintext is `MOCK_PASSWORD_HASH`. This mirrors the convention used
 * across the repo's e2e specs (see customers.e2e-spec.ts, auth.e2e-spec.ts):
 * PrismaService is stubbed per-file rather than hitting a real seeded DB.
 */
export const MOCK_PASSWORD = "Admin123*";

export const MOCK_PASSWORD_HASH =
  "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";

export interface MockUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
}

/**
 * Canonical fixture of one user per role, keyed by role, for RBAC e2e specs
 * to plug into their `PrismaService` stub's `user.findUnique`. All users
 * share `MOCK_PASSWORD_HASH` / log in with `MOCK_PASSWORD`.
 */
export const MOCK_USERS: Record<UserRole, MockUser> = {
  [UserRole.administrador]: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Admin Mock",
    email: "administrador@norgtech.local",
    passwordHash: MOCK_PASSWORD_HASH,
    role: UserRole.administrador,
    active: true,
  },
  [UserRole.director_comercial]: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Director Comercial Mock",
    email: "director_comercial@norgtech.local",
    passwordHash: MOCK_PASSWORD_HASH,
    role: UserRole.director_comercial,
    active: true,
  },
  [UserRole.comercial]: {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Comercial Mock",
    email: "comercial@norgtech.local",
    passwordHash: MOCK_PASSWORD_HASH,
    role: UserRole.comercial,
    active: true,
  },
  [UserRole.tecnico]: {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Tecnico Mock",
    email: "tecnico@norgtech.local",
    passwordHash: MOCK_PASSWORD_HASH,
    role: UserRole.tecnico,
    active: true,
  },
  [UserRole.facturacion]: {
    id: "00000000-0000-4000-8000-000000000005",
    name: "Facturacion Mock",
    email: "facturacion@norgtech.local",
    passwordHash: MOCK_PASSWORD_HASH,
    role: UserRole.facturacion,
    active: true,
  },
  [UserRole.logistica]: {
    id: "00000000-0000-4000-8000-000000000006",
    name: "Logistica Mock",
    email: "logistica@norgtech.local",
    passwordHash: MOCK_PASSWORD_HASH,
    role: UserRole.logistica,
    active: true,
  },
};

/**
 * Resolves a mock user by email, mirroring the shape Prisma's
 * `user.findUnique({ where: { email } })` returns. Drop this into a spec's
 * `PrismaService` stub, e.g.:
 *
 *   .overrideProvider(PrismaService).useValue({
 *     user: { findUnique: async ({ where }) => findMockUserByEmail(where.email) },
 *     ...
 *   })
 */
export function findMockUserByEmail(email: string | undefined): MockUser | null {
  if (!email) return null;
  const match = Object.values(MOCK_USERS).find((user) => user.email === email);
  return match ?? null;
}

export async function loginAs(
  app: INestApplication,
  role: UserRole,
): Promise<string> {
  const { email } = MOCK_USERS[role];

  const response = await request(app.getHttpServer())
    .post("/auth/login")
    .send({ email, password: MOCK_PASSWORD })
    .expect(200);

  return response.body.accessToken as string;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Minimal `refreshToken` model stub for a spec's `PrismaService` mock.
 * `AuthService.login()` also issues a refresh token via
 * `prisma.refreshToken.create(...)`, so every stub that defines `user` needs
 * a sibling `refreshToken` stub or login throws
 * "Cannot read properties of undefined (reading 'create')". Spread this into
 * the stub, e.g. `refreshToken: refreshTokenStub()`.
 */
export function refreshTokenStub() {
  return {
    create: async ({ data }: { data: Record<string, unknown> }) => ({
      id: "rt-test",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 7 * 864e5),
      createdAt: new Date(),
      ...data,
    }),
    findUnique: async () => null,
    findFirst: async () => null,
    update: async ({ data }: { data: Record<string, unknown> }) => ({
      id: "rt-test",
      ...data,
    }),
    updateMany: async () => ({ count: 0 }),
  };
}
