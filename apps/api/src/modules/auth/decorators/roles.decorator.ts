import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../auth.constants";

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
