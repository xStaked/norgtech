import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: true guarda los bytes crudos en request.rawBody: el KapsoWebhookGuard
  // firma/verifica el HMAC de Kapso contra los bytes originales del webhook.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  app.use(cookieParser());

  const frontendUrl = configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
  const allowedOrigins = frontendUrl.split(",").map((o) => o.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
