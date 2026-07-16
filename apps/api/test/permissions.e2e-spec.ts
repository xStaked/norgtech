import { UserRole } from "@prisma/client";
import { ROLE_GROUPS } from "../src/modules/auth/permissions";

describe("ROLE_GROUPS (permissions matrix)", () => {
  it("ADMIN_AND_DIRECTOR contains exactly administrador + director_comercial (RBAC-01)", () => {
    expect(ROLE_GROUPS.ADMIN_AND_DIRECTOR).toEqual([
      UserRole.administrador,
      UserRole.director_comercial,
    ]);
  });

  it("COMMERCIAL_WRITERS contains administrador + director_comercial + comercial", () => {
    expect(ROLE_GROUPS.COMMERCIAL_WRITERS).toEqual([
      UserRole.administrador,
      UserRole.director_comercial,
      UserRole.comercial,
    ]);
  });

  it("FIELD_OPS includes tecnico in addition to COMMERCIAL_WRITERS", () => {
    expect(ROLE_GROUPS.FIELD_OPS).toEqual(
      expect.arrayContaining(ROLE_GROUPS.COMMERCIAL_WRITERS),
    );
    expect(ROLE_GROUPS.FIELD_OPS).toContain(UserRole.tecnico);
    expect(ROLE_GROUPS.FIELD_OPS).toHaveLength(
      ROLE_GROUPS.COMMERCIAL_WRITERS.length + 1,
    );
  });

  it("BILLING equals administrador + director_comercial + facturacion", () => {
    expect(ROLE_GROUPS.BILLING).toEqual([
      UserRole.administrador,
      UserRole.director_comercial,
      UserRole.facturacion,
    ]);
  });

  it("LOGISTICS equals administrador + logistica", () => {
    expect(ROLE_GROUPS.LOGISTICS).toEqual([
      UserRole.administrador,
      UserRole.logistica,
    ]);
  });

  it("ADMIN_ONLY equals administrador only", () => {
    expect(ROLE_GROUPS.ADMIN_ONLY).toEqual([UserRole.administrador]);
  });

  it("invariant: administrador is present in every group", () => {
    for (const group of Object.values(ROLE_GROUPS)) {
      expect(group).toContain(UserRole.administrador);
    }
  });

  it("invariant: every member of every group is a valid UserRole", () => {
    const validRoles = Object.values(UserRole);
    const groups: ReadonlyArray<ReadonlyArray<UserRole>> = Object.values(ROLE_GROUPS);
    for (const group of groups) {
      for (const member of group) {
        expect(validRoles).toContain(member);
      }
    }
  });
});
