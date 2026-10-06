import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { RATE_LIMITS } from "../whatsapp/rate-limits.constants";

/**
 * No existe una ruta literal `GET /analytics/csv`: la exportación viaja en las
 * MISMAS rutas que las pantallas JSON vía `?format=csv|pdf`. Un `@Throttle`
 * directo sobre las rutas limitaria TAMBIÉN la navegación JSON (10/min por IP
 * compartida en oficina mata las 4 pantallas de analítica). Este guard sólo
 * cuenta las peticiones de exportación y deja pasar el resto sin tocar el
 * bucket, usando el límite fino del mapa de constantes (`analyticsCsv`).
 *
 * Corre como guard de controller DESPUÉS del ThrottlerGuard global, así que el
 * límite global 100/min sigue aplicando a todas las peticiones por separado.
 */
const ANALYTICS_EXPORT_THROTTLER_NAME = "analytics-export";

const EXPORT_FORMATS = new Set(["csv", "pdf"]);

@Injectable()
export class AnalyticsExportThrottleGuard extends ThrottlerGuard {
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    // Un único throttler nombrado con el límite fino: no duplicamos el bucket
    // global (éste ya lo aplica el ThrottlerGuard global).
    this.throttlers = [
      {
        name: ANALYTICS_EXPORT_THROTTLER_NAME,
        ttl: RATE_LIMITS.analyticsCsv.ttl,
        limit: RATE_LIMITS.analyticsCsv.limit,
      },
    ];
  }

  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ query?: { format?: string } }>();
    const format = request.query?.format;
    return Promise.resolve(!EXPORT_FORMATS.has(format ?? ""));
  }
}
