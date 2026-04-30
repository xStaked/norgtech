import { PrismaClient, UserRole } from "@prisma/client";

type BcryptModule = {
  hash(value: string, rounds: number): Promise<string>;
};

const bcrypt = require("bcryptjs") as BcryptModule;

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: "admin@norgtech.local" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@norgtech.local",
      passwordHash: await bcrypt.hash("Admin123*", 10),
      role: UserRole.admin,
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
