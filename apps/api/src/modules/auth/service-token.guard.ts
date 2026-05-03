import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers["authorization"] as string | undefined;

    if (!authHeader) {
      throw new UnauthorizedException("Missing authorization header");
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || token !== this.serviceToken) {
      throw new UnauthorizedException("Invalid service token");
    }

    return true;
  }
}