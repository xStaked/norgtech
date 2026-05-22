-- CreateEnum
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('nuevo', 'abierto', 'pendiente', 'cerrado');

-- CreateEnum
CREATE TYPE "WhatsAppSenderType" AS ENUM ('cliente', 'comercial', 'admin', 'desconocido');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "WhatsAppMessageRole" AS ENUM ('user', 'assistant', 'system', 'internal');

-- CreateEnum
CREATE TYPE "NoraActionStatus" AS ENUM ('proposed', 'confirmed', 'executed', 'discarded', 'failed');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sourceConversationId" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppAccount" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "senderName" TEXT,
    "senderType" "WhatsAppSenderType" NOT NULL DEFAULT 'desconocido',
    "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'nuevo',
    "assignedToUserId" TEXT,
    "customerId" TEXT,
    "contactId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kapsoMessageId" TEXT,
    "metaMessageId" TEXT,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "role" "WhatsAppMessageRole" NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "deliveryStatus" TEXT,
    "authorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppInternalNote" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppInternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConversationTag" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppConversationTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoraActionLog" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "actorUserId" TEXT,
    "mode" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "NoraActionStatus" NOT NULL DEFAULT 'proposed',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoraActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAccount_phoneNumberId_key" ON "WhatsAppAccount"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_accountId_waId_key" ON "WhatsAppConversation"("accountId", "waId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_status_updatedAt_idx" ON "WhatsAppConversation"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_phone_idx" ON "WhatsAppConversation"("phone");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_customerId_idx" ON "WhatsAppConversation"("customerId");

-- CreateIndex
CREATE INDEX "WhatsAppConversation_assignedToUserId_idx" ON "WhatsAppConversation"("assignedToUserId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_kapsoMessageId_idx" ON "WhatsAppMessage"("kapsoMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_metaMessageId_idx" ON "WhatsAppMessage"("metaMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppInternalNote_conversationId_createdAt_idx" ON "WhatsAppInternalNote"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversationTag_conversationId_label_key" ON "WhatsAppConversationTag"("conversationId", "label");

-- CreateIndex
CREATE INDEX "NoraActionLog_conversationId_createdAt_idx" ON "NoraActionLog"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "NoraActionLog_actorUserId_idx" ON "NoraActionLog"("actorUserId");

-- CreateIndex
CREATE INDEX "NoraActionLog_status_idx" ON "NoraActionLog"("status");

-- CreateIndex
CREATE INDEX "Order_sourceConversationId_idx" ON "Order"("sourceConversationId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WhatsAppAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppInternalNote" ADD CONSTRAINT "WhatsAppInternalNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConversationTag" ADD CONSTRAINT "WhatsAppConversationTag_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoraActionLog" ADD CONSTRAINT "NoraActionLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoraActionLog" ADD CONSTRAINT "NoraActionLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
