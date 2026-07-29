-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'visita_proxima';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "pushedAt" TIMESTAMP(3);

-- Lo que ya existe nace empujado: el outbox no debe inundar WhatsApp con el
-- backlog historico la primera vez que corre el cron.
UPDATE "Notification" SET "pushedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "Notification_pushedAt_createdAt_idx" ON "Notification"("pushedAt", "createdAt");
