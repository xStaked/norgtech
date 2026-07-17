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

describe("Zones (list active/inactive)", () => {
  let app: INestApplication;

  const zones = [
    { id: "zone-active", name: "Norte", department: "Antioquia", isActive: true },
    { id: "zone-inactive", name: "Sur", department: "Antioquia", isActive: false },
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
        zone: {
          // Honors the `where.isActive` filter so the includeInactive e2e is
          // real: findAll passes `where: { isActive: true }` by default and
          // `where: undefined` when includeInactive is set.
          findMany: async ({ where }: { where?: { isActive?: boolean } } = {}) =>
            zones.filter(
              (z) => where?.isActive === undefined || z.isActive === where.isActive,
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

  it("excludes inactive zones from the default list (ZON-01)", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .get("/zones")
      .set(authHeader(token))
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((z) => z.id);
    expect(ids).toContain("zone-active");
    expect(ids).not.toContain("zone-inactive");
  });

  it("includes inactive zones when includeInactive=true (ZON-01)", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .get("/zones?includeInactive=true")
      .set(authHeader(token))
      .expect(200);

    const ids = (response.body as Array<{ id: string }>).map((z) => z.id);
    expect(ids).toContain("zone-active");
    expect(ids).toContain("zone-inactive");
  });
});
