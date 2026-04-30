import { PrismaClient, UserRole } from "@prisma/client";

type BcryptModule = {
  hash(value: string, rounds: number): Promise<string>;
};

const bcrypt = require("bcryptjs") as BcryptModule;

const prisma = new PrismaClient();

const users = [
  {
    name: "Administrador",
    email: "admin@norgtech.com",
    password: "Admin123!",
    role: UserRole.administrador,
  },
  {
    name: "Director Comercial",
    email: "director@norgtech.com",
    password: "Director123!",
    role: UserRole.director_comercial,
  },
  {
    name: "Comercial",
    email: "comercial@norgtech.com",
    password: "Comercial123!",
    role: UserRole.comercial,
  },
  {
    name: "Tecnico",
    email: "tecnico@norgtech.com",
    password: "Tecnico123!",
    role: UserRole.tecnico,
  },
  {
    name: "Facturacion",
    email: "facturacion@norgtech.com",
    password: "Facturacion123!",
    role: UserRole.facturacion,
  },
  {
    name: "Logistica",
    email: "logistica@norgtech.com",
    password: "Logistica123!",
    role: UserRole.logistica,
  },
];

async function main() {
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 10);

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        active: true,
      },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
        active: true,
      },
    });
  }

  await prisma.customerSegment.upsert({
    where: { name: "Oro" },
    update: {},
    create: {
      name: "Oro",
      description: "Clientes de alto valor",
      active: true,
      createdBy: "system",
      updatedBy: "system",
    },
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
