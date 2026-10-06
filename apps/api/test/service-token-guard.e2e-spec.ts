import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { ServiceTokenGuard } from "../src/modules/auth/service-token.guard";

/**
 * ServiceTokenGuard (fase 3): token de servicio para rutas de agente
 * (LAURA_AGENT_SERVICE_TOKEN, header Authorization: Bearer).
 *
 * Spec unit con ExecutionContext fake, sin app: aquí se prueba el contrato
 * funcional del guard. La comparación timing-safe no es observable desde
 * fuera (solo funcional): lo que se asegura es que un token de cualquier
 * longitud distinta cae en "invalid" y nunca en un TypeError de cripto.
 */
describe("ServiceTokenGuard", () => {
  const SERVICE_TOKEN = "laura-service-token-e2e";

  const guardFor = (serviceToken?: string): ServiceTokenGuard =>
    new ServiceTokenGuard({
      get: (key: string) =>
        key === "LAURA_AGENT_SERVICE_TOKEN" ? serviceToken : undefined,
    } as unknown as ConfigService);

  const contextWithHeaders = (
    headers: Record<string, string | undefined>,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as unknown as ExecutionContext;

  it("(a) deja pasar Authorization: Bearer <token> correcto", () => {
    const guard = guardFor(SERVICE_TOKEN);
    const context = contextWithHeaders({ authorization: `Bearer ${SERVICE_TOKEN}` });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("(b) rechaza token incorrecto (UnauthorizedException)", () => {
    const guard = guardFor(SERVICE_TOKEN);
    const context = contextWithHeaders({ authorization: "Bearer wrong-token" });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException("Invalid service token"),
    );
  });

  it("(c) rechaza token de longitud distinta como inválido, sin excepción de longitudes", () => {
    // Con digests de longitud fija (SHA-256) timingSafeEqual nunca lanza
    // TypeError: un token corto cae en "invalid" igual que uno largo.
    const guard = guardFor(SERVICE_TOKEN);
    const shortContext = contextWithHeaders({ authorization: "Bearer short" });
    const longContext = contextWithHeaders({
      authorization: `Bearer ${SERVICE_TOKEN}${"x".repeat(64)}`,
    });

    expect(() => guard.canActivate(shortContext)).toThrow(
      new UnauthorizedException("Invalid service token"),
    );
    expect(() => guard.canActivate(longContext)).toThrow(
      new UnauthorizedException("Invalid service token"),
    );
  });

  it("(d) rechaza header ausente y esquema distinto de Bearer", () => {
    const guard = guardFor(SERVICE_TOKEN);

    expect(() => guard.canActivate(contextWithHeaders({}))).toThrow(
      new UnauthorizedException("Missing authorization header"),
    );
    expect(() =>
      guard.canActivate(
        contextWithHeaders({ authorization: `Basic ${SERVICE_TOKEN}` }),
      ),
    ).toThrow(new UnauthorizedException("Invalid service token"));
  });

  it("(e) fail-closed: sin LAURA_AGENT_SERVICE_TOKEN configurado rechaza siempre", () => {
    const guard = guardFor(undefined);
    const context = contextWithHeaders({ authorization: `Bearer ${SERVICE_TOKEN}` });

    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException("Service token not configured"),
    );
  });
});
