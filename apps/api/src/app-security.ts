import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";

/**
 * Configuración de middleware del app. La aplica el bootstrap de producción
 * (main.ts) y también los specs e2e que quieren montar el mismo stack real
 * (headers de seguridad, cookies, CORS) sobre el app de test.
 */
export function applyAppSecurity(app: INestApplication): void {
  // Detrás de nginx (1 salto): la IP que ve @nestjs/throttler debe ser la del
  // cliente real (X-Forwarded-For), no la del proxy, o el límite global por IP
  // castigaría a todos los usuarios como si fueran uno. Debe fijarse antes de
  // montar cualquier middleware/ruta que dependa de req.ip. El `set` es el
  // wrapper del `express.set()` nativo (ver docs de NestExpressApplication).
  const expressApp = app as NestExpressApplication;
  expressApp.set("trust proxy", 1);

  // Headers de seguridad por defecto de helmet (CSP, nosniff, frame options,
  // HSTS, COOP/CORP, etc.) sobre TODA respuesta, incluidos los errores.
  app.use(helmet());

  app.use(cookieParser());

  const configService = app.get(ConfigService);
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
}
