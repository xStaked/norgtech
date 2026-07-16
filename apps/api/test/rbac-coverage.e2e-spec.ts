import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { ROLES_KEY } from "../src/modules/auth/auth.constants";
import { ALLOWLIST_OPEN } from "./helpers/allowlist-open-endpoints";

/**
 * Coverage sweep: every write endpoint (POST/PATCH/PUT/DELETE) declared in
 * apps/api/src/modules/**\/*.controller.ts must carry `@Roles` metadata
 * (ROLES_KEY), either on the handler or on the controller class, unless it
 * is explicitly documented in ALLOWLIST_OPEN.
 *
 * This test is EXPECTED TO FAIL until Tasks 3-6 add the missing `@Roles`
 * decorators to the controllers listed in the failure output below. Do not
 * "fix" this test by widening the allowlist.
 */

const WRITE_METHODS = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

const METHOD_NAME: Record<number, "POST" | "PUT" | "PATCH" | "DELETE"> = {
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.DELETE]: "DELETE",
};

function normalizePath(prefix: string, handlerPath: string): string {
  const parts = [prefix, handlerPath]
    .map((part) => (part ?? "").toString())
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ""));
  return `/${parts.filter(Boolean).join("/")}`;
}

/**
 * Builds a Prisma stub that never throws on property access: any property
 * read returns another proxy, and any call resolves to `undefined`. This is
 * enough for AppModule to compile and initialize purely for reflection —
 * none of the modules under audit perform Prisma calls during
 * onModuleInit/bootstrap, so no real DB access happens in this test.
 */
function createInertPrismaStub(): unknown {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        // Prevent proxies from being mistaken for thenables.
        return undefined;
      }
      return new Proxy(() => undefined, handler);
    },
    apply() {
      return Promise.resolve(undefined);
    },
  };
  return new Proxy(() => undefined, handler);
}

describe("RBAC coverage sweep", () => {
  let moduleRef: TestingModule;
  let discoveryService: DiscoveryService;
  let metadataScanner: MetadataScanner;
  let reflector: Reflector;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createInertPrismaStub())
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    discoveryService = app.get(DiscoveryService);
    metadataScanner = app.get(MetadataScanner);
    reflector = app.get(Reflector);

    await app.close();
  });

  it("every write endpoint declares @Roles (handler or class) or is allowlisted", () => {
    const controllers = discoveryService.getControllers();
    const gaps: string[] = [];

    for (const wrapper of controllers) {
      const instance = wrapper.instance;
      if (!instance) continue;

      const controllerClass = wrapper.metatype as new (...args: unknown[]) => unknown;
      if (!controllerClass) continue;

      const controllerPrefix: string =
        Reflect.getMetadata(PATH_METADATA, controllerClass) ?? "";
      const classRoles = reflector.get<string[] | undefined>(ROLES_KEY, controllerClass);

      const prototype = Object.getPrototypeOf(instance);
      metadataScanner.getAllMethodNames(prototype).forEach((methodName) => {
        const handler = prototype[methodName];
        const routeMethod: number | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
        if (routeMethod === undefined || !WRITE_METHODS.has(routeMethod)) {
          return;
        }

        const handlerPath: string = Reflect.getMetadata(PATH_METADATA, handler) ?? "";
        const fullPath = normalizePath(controllerPrefix, handlerPath);
        const method = METHOD_NAME[routeMethod];

        const handlerRoles = reflector.get<string[] | undefined>(ROLES_KEY, handler);
        const hasRoles = (handlerRoles && handlerRoles.length > 0) || (classRoles && classRoles.length > 0);

        if (hasRoles) {
          return;
        }

        const isAllowlisted = ALLOWLIST_OPEN.some(
          (entry) => entry.method === method && entry.path === fullPath,
        );

        if (isAllowlisted) {
          return;
        }

        gaps.push(`${method} ${fullPath} (${controllerClass.name}.${methodName})`);
      });
    }

    if (gaps.length > 0) {
      throw new Error(
        `Found ${gaps.length} write endpoint(s) without @Roles metadata and not in ALLOWLIST_OPEN:\n` +
          gaps.sort().join("\n"),
      );
    }
  });
});
