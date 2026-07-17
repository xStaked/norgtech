import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  ALL_ROLES,
  findMockUserByEmail,
  loginAs,
  refreshTokenStub,
} from "./helpers/login-as";

describe("login-as helper", () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: async ({ where }: { where: { email?: string } }) =>
            findMockUserByEmail(where.email),
        },
        refreshToken: refreshTokenStub(),
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

  it.each(ALL_ROLES)("logs in as %s and returns a non-empty token", async (role) => {
    const token = await loginAs(app, role);

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });
});
