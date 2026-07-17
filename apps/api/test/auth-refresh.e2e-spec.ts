import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthService } from "../src/modules/auth/auth.service";
import { AUTH_JWT_SECRET } from "../src/modules/auth/auth.constants";
import { PrismaService } from "../src/prisma/prisma.service";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsonwebtoken = require("jsonwebtoken") as {
  decode(token: string): { exp: number; iat: number } | null;
  verify(token: string, secret: string): unknown;
};

type RefreshTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

describe("AuthService refresh tokens", () => {
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const activeUser = {
    id: "user-1",
    name: "Admin",
    email: "admin@norgtech.local",
    passwordHash,
    role: UserRole.administrador,
    active: true,
  };

  let store: RefreshTokenRecord[];
  let users: typeof activeUser[];
  let prismaStub: Pick<PrismaService, "user" | "refreshToken">;
  let authService: AuthService;
  let idCounter: number;

  beforeEach(() => {
    store = [];
    users = [activeUser];
    idCounter = 0;

    const refreshToken = {
      create: async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        const record: RefreshTokenRecord = {
          id: `token-${idCounter++}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        };
        store.push(record);
        return record;
      },
      findUnique: async ({ where: { tokenHash } }: { where: { tokenHash: string } }) =>
        store.find((r) => r.tokenHash === tokenHash) ?? null,
      update: async ({
        where: { id },
        data,
      }: {
        where: { id: string };
        data: { revokedAt: Date };
      }) => {
        const record = store.find((r) => r.id === id);
        if (!record) throw new Error("not found");
        record.revokedAt = data.revokedAt;
        return record;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tokenHash: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => {
        const matches = store.filter(
          (r) => r.tokenHash === where.tokenHash && r.revokedAt === where.revokedAt,
        );
        matches.forEach((r) => (r.revokedAt = data.revokedAt));
        return { count: matches.length };
      },
    };

    const user = {
      findUnique: async ({ where: { id, email } }: { where: { id?: string; email?: string } }) => {
        if (email) return users.find((u) => u.email === email) ?? null;
        if (id) return users.find((u) => u.id === id) ?? null;
        return null;
      },
    };

    prismaStub = { user, refreshToken } as unknown as Pick<PrismaService, "user" | "refreshToken">;
    authService = new AuthService(prismaStub as PrismaService);
  });

  it("login issues an access token and a raw refresh token, persisting only its hash", async () => {
    const result = await authService.login(activeUser.email, "Admin123*");

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(store).toHaveLength(1);
    expect(store[0].tokenHash).not.toEqual(result.refreshToken);
    expect(store[0].tokenHash).toHaveLength(64); // sha256 hex

    const decoded = jsonwebtoken.decode(result.accessToken) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  it("refresh rotates the token: new pair issued, old one marked revoked", async () => {
    const login = await authService.login(activeUser.email, "Admin123*");
    const oldRawToken = login.refreshToken;

    const refreshed = await authService.refresh(oldRawToken);

    expect(refreshed.accessToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).toEqual(expect.any(String));
    expect(refreshed.refreshToken).not.toEqual(oldRawToken);

    expect(store).toHaveLength(2);
    expect(store[0].revokedAt).not.toBeNull();

    // reuse of the rotated (now revoked) token must fail
    await expect(authService.refresh(oldRawToken)).rejects.toThrow(UnauthorizedException);
    await expect(authService.refresh(oldRawToken)).rejects.toThrow("Sesión expirada");
  });

  it("refresh with an unknown token is rejected", async () => {
    await expect(authService.refresh("not-a-real-token")).rejects.toThrow(UnauthorizedException);
  });

  it("refresh with an expired token is rejected", async () => {
    const login = await authService.login(activeUser.email, "Admin123*");
    store[0].expiresAt = new Date(Date.now() - 1000);

    await expect(authService.refresh(login.refreshToken)).rejects.toThrow(UnauthorizedException);
    await expect(authService.refresh(login.refreshToken)).rejects.toThrow("Sesión expirada");
  });

  it("refresh with a revoked token is rejected", async () => {
    const login = await authService.login(activeUser.email, "Admin123*");
    store[0].revokedAt = new Date();

    await expect(authService.refresh(login.refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  it("refresh rejects when the user is no longer active", async () => {
    const login = await authService.login(activeUser.email, "Admin123*");
    users[0] = { ...users[0], active: false };

    await expect(authService.refresh(login.refreshToken)).rejects.toThrow(UnauthorizedException);
    await expect(authService.refresh(login.refreshToken)).rejects.toThrow("Sesión expirada");
  });

  it("refresh rejects when the user no longer exists", async () => {
    const login = await authService.login(activeUser.email, "Admin123*");
    users = [];

    await expect(authService.refresh(login.refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  it("logout revokes the matching token (idempotent)", async () => {
    const login = await authService.login(activeUser.email, "Admin123*");

    await authService.logout(login.refreshToken);
    expect(store[0].revokedAt).not.toBeNull();

    // calling again on an already-revoked token must not throw
    await expect(authService.logout(login.refreshToken)).resolves.toBeUndefined();
  });

  it("logout on an unknown token does not throw", async () => {
    await expect(authService.logout("unknown-token")).resolves.toBeUndefined();
  });

  it("signAccess payload still uses AUTH_JWT_SECRET", async () => {
    const login = await authService.login(activeUser.email, "Admin123*");
    const decoded = jsonwebtoken.verify(login.accessToken, AUTH_JWT_SECRET) as {
      sub: string;
      role: string;
      email: string;
    };
    expect(decoded.sub).toBe(activeUser.id);
    expect(decoded.role).toBe(activeUser.role);
    expect(decoded.email).toBe(activeUser.email);
  });
});
