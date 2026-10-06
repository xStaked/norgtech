import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const KAPSO_SECRET_ENV = "KAPSO_WEBHOOK_SECRET";
const SECURITY_MODE_ENV = "WEBHOOK_SECURITY";
const TOKEN_HEADER = "x-webhook-token";
const SIGNATURE_HEADER = "x-kapso-signature";

type IncomingWebhookRequest = {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
};

/**
 * Autenticación del webhook de Kapso (`POST /whatsapp/webhooks/kapso`).
 *
 * Acepta dos credenciales (Ruling 1):
 *  - Firma HMAC-SHA256 del rawBody en `X-Kapso-Signature: sha256=<hex>`.
 *    Requiere `rawBody: true` en `NestFactory.create` (main.ts): el HMAC se
 *    calcula sobre los bytes crudos, no sobre el body ya parseado.
 *  - Token compartido en `X-Webhook-Token`, comparado en tiempo constante.
 *
 * Modos (`WEBHOOK_SECURITY`): `strict` (default) responde 401 sin credenciales
 * válidas; `warn` solo loguea warning y deja pasar, para la transición hasta
 * que se confirme qué credencial manda el webhook real de Kapso.
 *
 * Ruling 2: si `KAPSO_WEBHOOK_SECRET` no está configurado el guard queda
 * fail-open y avisa en boot; el 401 estricto solo aplica con secreto presente.
 * Nunca se loguea el secreto ni el valor de los encabezados enviados.
 */
@Injectable()
export class KapsoWebhookGuard implements CanActivate {
  private readonly logger = new Logger(KapsoWebhookGuard.name);

  constructor(private readonly configService: ConfigService) {
    // Aviso de arranque (Ruling 2): que un despliegue sin secreto sea visible
    // desde el primer boot, mientras el guard sigue sin romper el webhook.
    if (!this.configService.get<string>(KAPSO_SECRET_ENV)) {
      this.logger.warn(
        "KAPSO_WEBHOOK_SECRET no está configurado: el webhook de Kapso queda sin autenticación. " +
          "Configura el secreto, o usa WEBHOOK_SECURITY=warn durante la transición si sigue abierto.",
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IncomingWebhookRequest>();
    const token = this.singleHeaderValue(request.headers[TOKEN_HEADER]);
    const signatureHeader = this.singleHeaderValue(request.headers[SIGNATURE_HEADER]);
    const secret = this.configService.get<string>(KAPSO_SECRET_ENV);

    // Sin secreto no hay nada que verificar (Ruling 2): fail-open en ambos modos.
    if (!secret) {
      return true;
    }

    const signatures = this.signatureCandidates(signatureHeader);
    const tokenValid = token !== undefined && this.timingSafeCompare(token, secret);
    const signatureValid = signatures.some((candidate) =>
      this.signatureMatches(candidate, request.rawBody, secret),
    );

    // Una credencial válida (firma o token) pasa en cualquier modo.
    if (tokenValid || signatureValid) {
      return true;
    }

    if (!this.isWarnMode()) {
      throw new UnauthorizedException("Kapso webhook authentication failed");
    }

    // Warn: no bloquea, pero cada request sospechoso queda en el log.
    this.logger.warn(
      `Kapso webhook request accepted in warn mode without valid credentials (${this.rejectReason(
        token,
        signatureHeader,
        signatures,
        request,
      )})`,
    );
    return true;
  }

  private isWarnMode(): boolean {
    return (
      (this.configService.get<string>(SECURITY_MODE_ENV) ?? "strict")
        .trim()
        .toLowerCase() === "warn"
    );
  }

  /**
   * Motivo legible del rechazo, sin secretos ni valores: solo qué faltó o qué
   * header falló. Con firma de por medio también explica si no se pudo
   * verificar (rawBody ausente = proxy/app mal configurados).
   */
  private rejectReason(
    token: string | undefined,
    signatureHeader: string | undefined,
    signatures: string[],
    request: IncomingWebhookRequest,
  ): string {
    if (token === undefined && signatureHeader === undefined) {
      return "no credentials: X-Webhook-Token and X-Kapso-Signature absent";
    }

    const reasons: string[] = [];
    if (token !== undefined) {
      reasons.push("invalid X-Webhook-Token");
    }
    if (signatureHeader !== undefined) {
      if (signatures.length === 0) {
        reasons.push(`${SIGNATURE_HEADER} is malformed`);
      } else if (!request.rawBody) {
        reasons.push(
          `${SIGNATURE_HEADER} could not be verified: request.rawBody is missing (enable rawBody: true)`,
        );
      } else {
        reasons.push(`${SIGNATURE_HEADER} does not match the HMAC of the raw body`);
      }
    }
    return reasons.join("; ");
  }

  /** Primer valor del header; headers llegan en minúscula desde Express. */
  private singleHeaderValue(value: string | string[] | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    const first = Array.isArray(value) ? value[0] : value;
    const trimmed = first?.trim();
    return trimmed ? trimmed : undefined;
  }

  /**
   * Lista de firmas candidatas: tolera listas separadas por coma y el prefijo
   * `sha256=` (con o sin mayúsculas). Se conservan solo entradas hexadecimales;
   * lo demás cae como "malformed".
   */
  private signatureCandidates(value: string | undefined): string[] {
    if (value === undefined) {
      return [];
    }
    return value
      .split(",")
      .map((entry) => entry.trim().replace(/^sha256=/i, ""))
      .filter((entry) => /^[0-9a-f]+$/i.test(entry));
  }

  /** HMAC-SHA256 (hex) del rawBody contra el secreto; sin rawBody no hay nada que comparar. */
  private signatureMatches(
    providedHex: string,
    rawBody: Buffer | undefined,
    secret: string,
  ): boolean {
    if (!rawBody) {
      return false;
    }
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return this.timingSafeCompare(providedHex.toLowerCase(), expected);
  }

  /**
   * Comparación en tiempo constante sobre digests de longitud fija: nunca
   * filtra largo del secreto ni posición del primer byte distinto.
   */
  private timingSafeCompare(left: string, right: string): boolean {
    const leftDigest = createHash("sha256").update(left, "utf8").digest();
    const rightDigest = createHash("sha256").update(right, "utf8").digest();
    return timingSafeEqual(leftDigest, rightDigest);
  }
}
