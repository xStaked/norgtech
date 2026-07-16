import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  ALL_ROLES,
  authHeader,
  findMockUserByEmail,
  loginAs,
} from "./helpers/login-as";

/**
 * RBAC-01..03: `administrador` and `director_comercial` must both be able to
 * write to Empresas (companies) and Zonas (zones). Every other role must be
 * rejected with 403. This spec is expected to FAIL before companies/zones
 * controllers are widened from `@Roles("administrador")` to
 * `@Roles(...ROLE_GROUPS.ADMIN_AND_DIRECTOR)`.
 */
describe("RBAC: companies & zones admin+director", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  const ALLOWED_ROLES: UserRole[] = [
    UserRole.administrador,
    UserRole.director_comercial,
  ];

  const FORBIDDEN_ROLES: UserRole[] = ALL_ROLES.filter(
    (role) => !ALLOWED_ROLES.includes(role),
  );

  const existingCompany = {
    id: "company-1",
    name: "Agro Norte",
    legalName: "Agro Norte SAS",
    nit: "900123456",
    prefix: "AGN",
    isActive: true,
  };

  const existingZone = {
    id: "zone-1",
    name: "Norte",
    department: "Antioquia",
    isActive: true,
  };

  beforeAll(async () => {
    const prismaStub = {
      user: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
          findMockUserByEmail(where.email),
      },
      company: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "company-new",
          isActive: true,
          ...data,
        }),
        findUnique: async ({ where }: { where: { id?: string; prefix?: string } }) => {
          if (where.id === existingCompany.id) return existingCompany;
          if (where.prefix === existingCompany.prefix) return existingCompany;
          return null;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
          ...existingCompany,
          id: where.id,
          ...data,
        }),
      },
      zone: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "zone-new",
          isActive: true,
          ...data,
        }),
        findUnique: async ({ where }: { where: { id?: string; name?: string } }) => {
          if (where.id === existingZone.id) return existingZone;
          if (where.name === existingZone.name) return existingZone;
          return null;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
          ...existingZone,
          id: where.id,
          ...data,
        }),
      },
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe.each(ALLOWED_ROLES)("as %s", (role) => {
    it("is not forbidden from writing companies", async () => {
      const token = await loginAs(app, role);

      const createRes = await request(app.getHttpServer())
        .post("/companies")
        .set(authHeader(token))
        .send({
          name: "Agro Sur",
          legalName: "Agro Sur SAS",
          nit: "900999999",
          prefix: "AGS",
        });
      expect(createRes.status).not.toBe(403);

      const patchRes = await request(app.getHttpServer())
        .patch(`/companies/${existingCompany.id}`)
        .set(authHeader(token))
        .send({ name: "Agro Norte Renamed" });
      expect(patchRes.status).not.toBe(403);
    });

    it("is not forbidden from writing zones", async () => {
      const token = await loginAs(app, role);

      const createRes = await request(app.getHttpServer())
        .post("/zones")
        .set(authHeader(token))
        .send({ name: "Sur", department: "Valle" });
      expect(createRes.status).not.toBe(403);

      const patchRes = await request(app.getHttpServer())
        .patch(`/zones/${existingZone.id}`)
        .set(authHeader(token))
        .send({ name: "Norte Renombrada" });
      expect(patchRes.status).not.toBe(403);
    });
  });

  describe.each(FORBIDDEN_ROLES)("as %s", (role) => {
    it("is forbidden from writing companies", async () => {
      const token = await loginAs(app, role);

      const createRes = await request(app.getHttpServer())
        .post("/companies")
        .set(authHeader(token))
        .send({
          name: "Agro Sur",
          legalName: "Agro Sur SAS",
          nit: "900999999",
          prefix: "AGS",
        });
      expect(createRes.status).toBe(403);

      const patchRes = await request(app.getHttpServer())
        .patch(`/companies/${existingCompany.id}`)
        .set(authHeader(token))
        .send({ name: "Agro Norte Renamed" });
      expect(patchRes.status).toBe(403);
    });

    it("is forbidden from writing zones", async () => {
      const token = await loginAs(app, role);

      const createRes = await request(app.getHttpServer())
        .post("/zones")
        .set(authHeader(token))
        .send({ name: "Sur", department: "Valle" });
      expect(createRes.status).toBe(403);

      const patchRes = await request(app.getHttpServer())
        .patch(`/zones/${existingZone.id}`)
        .set(authHeader(token))
        .send({ name: "Norte Renombrada" });
      expect(patchRes.status).toBe(403);
    });
  });
});
