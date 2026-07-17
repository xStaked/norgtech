import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  authHeader,
  findMockUserByEmail,
  loginAs,
  refreshTokenStub,
} from "./helpers/login-as";
import { UserRole } from "@prisma/client";

describe("Companies (list active/inactive)", () => {
  let app: INestApplication;

  const companies = [
    { id: "company-active", name: "Nortech", legalName: "Nortech SAS", nit: "900", prefix: "NT", isActive: true },
    { id: "company-inactive", name: "Vieja", legalName: "Vieja SAS", nit: "901", prefix: "VJ", isActive: false },
  ];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: async ({ where }: { where: { email?: string } }) =>
            findMockUserByEmail(where.email),
        },
        refreshToken: refreshTokenStub(),
        company: {
          // Honors the `where.isActive` filter so the includeInactive e2e is
          // real: findAll passes `where: { isActive: true }` by default and
          // `where: undefined` when includeInactive is set.
          findMany: async ({ where }: { where?: { isActive?: boolean } } = {}) =>
            companies.filter(
              (c) => where?.isActive === undefined || c.isActive === where.isActive,
            ),
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("excludes inactive companies from the default list (COM-01)", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get("/companies")
      .set(authHeader(token))
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain("company-active");
    expect(ids).not.toContain("company-inactive");
  });

  it("includes inactive companies when includeInactive=true (COM-01)", async () => {
    const token = await loginAs(app, UserRole.comercial);

    const response = await request(app.getHttpServer())
      .get("/companies?includeInactive=true")
      .set(authHeader(token))
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain("company-active");
    expect(ids).toContain("company-inactive");
  });
});
