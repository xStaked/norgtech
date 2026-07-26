import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  authHeader,
  findMockUserByEmail,
  loginAs,
  refreshTokenStub,
} from "./helpers/login-as";

interface Hit {
  type: string;
  id: string;
  title: string;
}

describe("Search (global palette)", () => {
  let app: INestApplication;

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
        customer: {
          findMany: async () => [
            { id: "cus-1", displayName: "Agro Norte", taxId: "900123", city: "Medellín" },
          ],
        },
        order: {
          findMany: async () => [
            {
              id: "ord-1",
              orderNumber: "PED-001",
              status: "recibido",
              customerNameSnapshot: "Agro Norte",
              customer: { displayName: "Agro Norte" },
            },
          ],
        },
        product: {
          findMany: async () => [
            { id: "pro-1", name: "Agrovita", sku: "SKU-1", presentation: null },
          ],
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

  it("devuelve los tres tipos para un administrador", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .get("/search?q=agro")
      .set(authHeader(token))
      .expect(200);

    const types = (response.body as Hit[]).map((hit) => hit.type);
    expect(types).toEqual(expect.arrayContaining(["customer", "order", "product"]));
  });

  it("logistica no ve productos y tecnico no ve pedidos", async () => {
    const logistica = await loginAs(app, UserRole.logistica);
    const logisticaRes = await request(app.getHttpServer())
      .get("/search?q=agro")
      .set(authHeader(logistica))
      .expect(200);
    const logisticaTypes = (logisticaRes.body as Hit[]).map((hit) => hit.type);
    expect(logisticaTypes).toContain("order");
    expect(logisticaTypes).not.toContain("product");

    const tecnico = await loginAs(app, UserRole.tecnico);
    const tecnicoRes = await request(app.getHttpServer())
      .get("/search?q=agro")
      .set(authHeader(tecnico))
      .expect(200);
    const tecnicoTypes = (tecnicoRes.body as Hit[]).map((hit) => hit.type);
    expect(tecnicoTypes).toContain("customer");
    expect(tecnicoTypes).not.toContain("order");
    expect(tecnicoTypes).not.toContain("product");
  });

  it("no consulta la base con menos de 2 caracteres", async () => {
    const token = await loginAs(app, UserRole.administrador);

    const response = await request(app.getHttpServer())
      .get("/search?q=a")
      .set(authHeader(token))
      .expect(200);

    expect(response.body).toEqual([]);
  });
});
