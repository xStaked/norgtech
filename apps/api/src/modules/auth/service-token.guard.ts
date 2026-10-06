import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, timingSafeEqual } from "node:crypto";

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly serviceToken: string;

  constructor(configService: ConfigService) {
    this.serviceToken = configService.get<string>("LAURA_AGENT_SERVICE_TOKEN") ?? "";
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.serviceToken) {
      throw new UnauthorizedException("Service token not configured");
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const authHeader = request.headers["authorization"];

    if (!authHeader) {
      throw new UnauthorizedException("Missing authorization header");
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token || !this.timingSafeCompare(token, this.serviceToken)) {
      throw new UnauthorizedException("Invalid service token");
    }

    return true;
  }

  /**
   * Espejo de `KapsoWebhookGuard.timingSafeCompare` (modules/whatsapp/kapso-webhook.guard.ts,
   * fase 3): allá es un método privado y no se exporta, así que se replica
   * idéntico aquí para que ambas comparaciones de secretos sean seguras.
   *
   * Se hashea cada operando con SHA-256 y se compara con timingSafeEqual sobre
   * digests de longitud fija (32 bytes): timingSafeEqual lanza TypeError si las
   * longitudes difieren y por sí solo filtra el largo del secreto por timing;
   * con digests fijos no puede ocurrir y el tiempo de comparación no depende de
   * dónde divergen las cadenas. La verificación funcional (válido/inválido) no
   * cambia respecto al `!==` anterior.
   */
  private timingSafeCompare(left: string, right: string): boolean {
    const leftDigest = createHash("sha256").update(left, "utf8").digest();
    const rightDigest = createHash("sha256").update(right, "utf8").digest();
    return timingSafeEqual(leftDigest, rightDigest);
  }
}