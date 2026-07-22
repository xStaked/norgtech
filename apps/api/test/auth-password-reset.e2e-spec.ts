import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthService } from "../src/modules/auth/auth.service";
import { renderPasswordResetEmail } from "../src/modules/auth/password-reset-email";
import { PrismaService } from "../src/prisma/prisma.service";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require("bcryptjs") as {
  compare(value: string, hash: string): Promise<boolean>;
};

type ResetRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type RefreshRecord = { id: string; userId: string; revokedAt: Date | null };

describe("AuthService password reset", () => {
  // hash de "Admin123*"
  const passwordHash = "$2a$10$eHlBtTx4HDVGtfsH8BSxG.JwwXsYNrKcdePOt3.1/./NPQ0CHs.w2";
  const baseUser = {
    id: "user-1",
    name: "Daniel Cortés",
    email: "daniel.cortes@norgtech.co",
    passwordHash,
    role: UserRole.comercial,
    active: true,
  };

  let users: (typeof baseUser)[];
  let resets: ResetRecord[];
  let refreshes: RefreshRecord[];
  let sentEmails: { to: string[]; html: string }[];
  let authService: AuthService;
  let idCounter: number;
  const realFetch = global.fetch;

  beforeEach(() => {
    users = [{ ...baseUser }];
    resets = [];
    refreshes = [{ id: "rt-1", userId: baseUser.id, revokedAt: null }];
    sentEmails = [];
    idCounter = 0;

    process.env.RESEND_API_KEY = "test-key";
    process.env.FRONTEND_URL = "https://app.norgtech.co";

    global.fetch = (async (_url: string, init: { body: string }) => {
      sentEmails.push(JSON.parse(init.body));
      return { ok: true, status: 200, text: async () => "" };
    }) as unknown as typeof fetch;

    const passwordResetToken = {
      create: async ({
        data,
      }: {
        data: { userId: string; tokenHash: string; expiresAt: Date };
      }) => {
        const record: ResetRecord = {
          id: `reset-${idCounter++}`,
          usedAt: null,
          createdAt: new Date(),
          ...data,
        };
        resets.push(record);
        return record;
      },
      findUnique: async ({ where: { tokenHash } }: { where: { tokenHash: string } }) =>
        resets.find((r) => r.tokenHash === tokenHash) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; usedAt: null };
        data: { usedAt: Date };
      }) => {
        const matches = resets.filter((r) => r.id === where.id && r.usedAt === null);
        matches.forEach((r) => (r.usedAt = data.usedAt));
        return { count: matches.length };
      },
    };

    const user = {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        users.find((u) => u.id === where.id || u.email === where.email) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { passwordHash: string };
      }) => {
        const found = users.find((u) => u.id === where.id);
        if (!found) throw new Error("not found");
        found.passwordHash = data.passwordHash;
        return found;
      },
    };

    const refreshToken = {
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; revokedAt: null };
        data: { revokedAt: Date };
      }) => {
        const matches = refreshes.filter(
          (r) => r.userId === where.userId && r.revokedAt === null,
        );
        matches.forEach((r) => (r.revokedAt = data.revokedAt));
        return { count: matches.length };
      },
    };

    const prismaStub = {
      user,
      refreshToken,
      passwordResetToken,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ user, refreshToken, passwordResetToken }),
    };

    authService = new AuthService(prismaStub as unknown as PrismaService);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it("guarda solo el hash del token y envía el enlace crudo por correo", async () => {
    await authService.requestPasswordReset(baseUser.email);

    expect(resets).toHaveLength(1);
    expect(resets[0].tokenHash).toHaveLength(64); // sha256 hex
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toEqual([baseUser.email]);

    const link = sentEmails[0].html.match(
      /https:\/\/app\.norgtech\.co\/restablecer\?token=([a-f0-9]+)/,
    );
    expect(link).not.toBeNull();
    expect(resets[0].tokenHash).not.toEqual(link![1]);
  });

  it("no revela si el correo existe ni envía nada para usuarios desconocidos o inactivos", async () => {
    await expect(
      authService.requestPasswordReset("nadie@norgtech.co"),
    ).resolves.toBeUndefined();

    users[0].active = false;
    await expect(
      authService.requestPasswordReset(baseUser.email),
    ).resolves.toBeUndefined();

    expect(resets).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("un fallo de Resend no propaga error al cliente", async () => {
    global.fetch = (async () => ({
      ok: false,
      status: 422,
      text: async () => "dominio no verificado",
    })) as unknown as typeof fetch;

    await expect(
      authService.requestPasswordReset(baseUser.email),
    ).resolves.toBeUndefined();
    expect(resets).toHaveLength(1);
  });

  it("cambia la contraseña, marca el token usado y revoca las sesiones abiertas", async () => {
    await authService.requestPasswordReset(baseUser.email);
    const rawToken = sentEmails[0].html.match(/token=([a-f0-9]+)/)![1];

    await authService.resetPassword(rawToken, "NuevaClave123");

    expect(await bcrypt.compare("NuevaClave123", users[0].passwordHash)).toBe(true);
    expect(resets[0].usedAt).not.toBeNull();
    expect(refreshes[0].revokedAt).not.toBeNull();
  });

  it("rechaza token desconocido, ya usado o expirado", async () => {
    await expect(authService.resetPassword("no-existe", "NuevaClave123")).rejects.toThrow(
      BadRequestException,
    );

    await authService.requestPasswordReset(baseUser.email);
    const rawToken = sentEmails[0].html.match(/token=([a-f0-9]+)/)![1];

    await authService.resetPassword(rawToken, "NuevaClave123");
    // reuso del mismo enlace
    await expect(authService.resetPassword(rawToken, "OtraClave123")).rejects.toThrow(
      BadRequestException,
    );
    expect(await bcrypt.compare("OtraClave123", users[0].passwordHash)).toBe(false);

    resets[0].usedAt = null;
    resets[0].expiresAt = new Date(Date.now() - 1000);
    await expect(authService.resetPassword(rawToken, "OtraClave123")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("el template escapa el HTML del nombre y del correo", () => {
    const html = renderPasswordResetEmail({
      name: '<script>alert(1)</script> Cortés',
      email: 'a"b@norgtech.co',
      resetUrl: "https://app.norgtech.co/restablecer?token=abc",
      expiresInMinutes: 30,
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a&quot;b@norgtech.co");
    expect(html).toContain("expira en <strong>30 minutos</strong>");
  });
});
