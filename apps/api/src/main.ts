import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { applyAppSecurity } from "./app-security";

async function bootstrap() {
  // rawBody: true guarda los bytes crudos en request.rawBody: el KapsoWebhookGuard
  // firma/verifica el HMAC de Kapso contra los bytes originales del webhook.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  applyAppSecurity(app);

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
