import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { applyAppSecurity } from "../src/app-security";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Headers de seguridad (fase 3): cualquier respuesta del API debe salir con
 * los headers básicos de helmet, tanto en respuestas felices (200) como en
 * errores (404): el middleware corre antes del routing.
 *
 * El app de test monta el mismo stack que main.ts aplica en producción vía
 * `applyAppSecurity`; el stub de Prisma aísla el spec de la base de datos.
 */
describe("Security headers (helmet)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    applyAppSecurity(app);
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("GET /health sale con los headers básicos de helmet", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect({ status: "ok" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["strict-transport-security"]).toBeDefined();
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin");
  });

  it("las respuestas de error también pasan por helmet (middleware antes del routing)", async () => {
    const response = await request(app.getHttpServer())
      .get("/ruta-que-no-existe")
      .expect(404);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });
});
