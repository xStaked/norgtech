import { INestApplication, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { createHmac } from "node:crypto";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * KapsoWebhookGuard — fase 3 seguridad.
 *
 * Casos del brief:
 *   (a) sin headers y modo strict con secret → 401
 *   (b) con `X-Webhook-Token: <secret>` → success
 *   (c) con `X-Kapso-Signature: sha256=<hmac del rawBody>` → success
 *   (d) firma inválida → 401
 *   (e) modo warn sin headers → success y log warning
 *   (f) Ruling 2: sin KAPSO_WEBHOOK_SECRET configurado → pasa (fail-open,
 *       con aviso en boot; no rompe despliegues que aún no configuraron el secreto)
 *
 * El stub usa el patrón de la rama (`overrideProvider(PrismaService)`); los
 * payloads de este spec usan un evento no inbound (`type: whatsapp.message.sent`)
 * así la respuesta es `{ ignored: true }` sin tocar Prisma: aquí se prueba
 * el guard, no la lógica del webhook (esa está en whatsapp.e2e-spec.ts).
 */
describe("KapsoWebhookGuard", () => {
  const KAPSO_WEBHOOK_SECRET = "kapso-e2e-guard-secret";
  const TOKEN_HEADER = "X-Webhook-Token";
  const SIGNATURE_HEADER = "X-Kapso-Signature";

  /** Evento kapso NO inbound: el guard deja pasar y el service responde ignored. */
  const kapsoEvent = {
    type: "whatsapp.message.sent",
    data: {
      phone_number_id: "phone-guard-1",
      message: { id: "wamid-guard-1", from: "573000000011" },
    },
  };
  const rawEvent = JSON.stringify(kapsoEvent);

  let app: INestApplication;
  let moduleRef: TestingModule;
  let originalSecret: string | undefined;
  let originalSecurity: string | undefined;

  beforeAll(async () => {
    // Debe fijarse ANTES de compilar: ConfigModule congela el proceso.env que
    // existía al inicializar (el .env de un desenvolvedor no manda: process.env gana).
    originalSecret = process.env.KAPSO_WEBHOOK_SECRET;
    originalSecurity = process.env.WEBHOOK_SECURITY;
    process.env.KAPSO_WEBHOOK_SECRET = KAPSO_WEBHOOK_SECRET;
    delete process.env.WEBHOOK_SECURITY; // default = strict

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    // rawBody: true es lo que main.ts habilita; el HMAC se calcula sobre
    // request.rawBody, no sobre el body ya parseado.
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (originalSecret === undefined) {
      delete process.env.KAPSO_WEBHOOK_SECRET;
    } else {
      process.env.KAPSO_WEBHOOK_SECRET = originalSecret;
    }
    if (originalSecurity === undefined) {
      delete process.env.WEBHOOK_SECURITY;
    } else {
      process.env.WEBHOOK_SECURITY = originalSecurity;
    }
  });

  /** Firma HMAC-SHA256 (hex) del rawBody con el secreto, como la mandaría Kapso. */
  const signatureFor = (rawBody: string, secret = KAPSO_WEBHOOK_SECRET) =>
    createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  it("(a) rechaza sin credenciales en modo strict (401 con body JSON)", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .set("Content-Type", "application/json")
      .send(rawEvent)
      .expect(401)
      .expect("Content-Type", /json/);

    expect(response.body).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
    });
  });

  it("(b) acepta con X-Webhook-Token válido (Nest responde 201 por defecto en POST)", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .set(TOKEN_HEADER, KAPSO_WEBHOOK_SECRET)
      .send(kapsoEvent)
      .expect(201);

    expect(response.body).toEqual({ ignored: true });
  });

  it("(c) acepta con X-Kapso-Signature válida sobre el rawBody", async () => {
    const response = await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .set("Content-Type", "application/json")
      .set(SIGNATURE_HEADER, `sha256=${signatureFor(rawEvent)}`)
      .send(rawEvent)
      .expect(201);

    expect(response.body).toEqual({ ignored: true });
  });

  it("(d) rechaza credenciales inválidas en strict: firma incorrecta, header corrupto y token erróneo", async () => {
    // Firma con formato válido pero digest equivocado.
    await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .set("Content-Type", "application/json")
      .set(SIGNATURE_HEADER, `sha256=${"ab".repeat(32)}`)
      .send(rawEvent)
      .expect(401);

    // Header de firma que no es hex ni trae lista parsesable.
    await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .set("Content-Type", "application/json")
      .set(SIGNATURE_HEADER, "sha256=not-a-signature")
      .send(rawEvent)
      .expect(401);

    // Token compartido equivocado (fallback Ruling 1) también cae en 401.
    await request(app.getHttpServer())
      .post("/whatsapp/webhooks/kapso")
      .set(TOKEN_HEADER, "kapso-wrong-token")
      .send(kapsoEvent)
      .expect(401);
  });

  it("(e) en modo warn acepta sin credenciales y loguea warning", async () => {
    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    const configService = moduleRef.get(ConfigService, { strict: false });

    try {
      configService.set("WEBHOOK_SECURITY", "warn");

      // Sin credenciales: pasa y avisa.
      await request(app.getHttpServer())
        .post("/whatsapp/webhooks/kapso")
        .send(kapsoEvent)
        .expect(201);

      // Con credenciales malas: mismo comportamiento (warn pasa + avisa).
      await request(app.getHttpServer())
        .post("/whatsapp/webhooks/kapso")
        .set(TOKEN_HEADER, "kapso-wrong-token")
        .send(kapsoEvent)
        .expect(201);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Kapso webhook"),
      );
    } finally {
      warnSpy.mockRestore();
      // ConfigService.set escribe process.env con String(undefined): limpiarlo.
      configService.set("WEBHOOK_SECURITY", undefined);
      delete process.env.WEBHOOK_SECURITY;
    }
  });

  it("(f) Ruling 2: sin secreto configurado el webhook sigue abierto (no rompe el despliegue)", async () => {
    const configService = moduleRef.get(ConfigService, { strict: false });

    try {
      // El boot (beforeAll) ya tenía secreto; vaciarlo simula el despliegue sin config.
      configService.set("KAPSO_WEBHOOK_SECRET", "");

      await request(app.getHttpServer())
        .post("/whatsapp/webhooks/kapso")
        .send(kapsoEvent)
        .expect(201);
    } finally {
      configService.set("KAPSO_WEBHOOK_SECRET", KAPSO_WEBHOOK_SECRET);
    }
  });
});
