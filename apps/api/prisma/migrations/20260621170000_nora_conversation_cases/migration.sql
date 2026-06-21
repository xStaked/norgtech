-- CreateEnum
CREATE TYPE "NoraConversationCaseType" AS ENUM ('order', 'new_customer', 'expense');

-- CreateEnum
CREATE TYPE "NoraConversationCaseStatus" AS ENUM ('collecting_info', 'ready_for_review', 'approved', 'executed', 'cancelled', 'blocked');

-- CreateEnum
CREATE TYPE "NoraCaseRiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "NoraConversationCase" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "parentCaseId" TEXT,
    "type" "NoraConversationCaseType" NOT NULL,
    "status" "NoraConversationCaseStatus" NOT NULL DEFAULT 'collecting_info',
    "extractedData" JSONB NOT NULL DEFAULT '{}',
    "missingFields" JSONB NOT NULL DEFAULT '[]',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "proposal" JSONB,
    "lastQuestion" TEXT,
    "riskLevel" "NoraCaseRiskLevel" NOT NULL DEFAULT 'medium',
    "createdByUserId" TEXT,
    "approvedByUserId" TEXT,
    "executedEntityType" TEXT,
    "executedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoraConversationCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoraConversationCase_conversationId_status_updatedAt_idx" ON "NoraConversationCase"("conversationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "NoraConversationCase_parentCaseId_idx" ON "NoraConversationCase"("parentCaseId");

-- CreateIndex
CREATE INDEX "NoraConversationCase_createdByUserId_idx" ON "NoraConversationCase"("createdByUserId");

-- CreateIndex
CREATE INDEX "NoraConversationCase_approvedByUserId_idx" ON "NoraConversationCase"("approvedByUserId");

-- AddForeignKey
ALTER TABLE "NoraConversationCase" ADD CONSTRAINT "NoraConversationCase_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoraConversationCase" ADD CONSTRAINT "NoraConversationCase_parentCaseId_fkey" FOREIGN KEY ("parentCaseId") REFERENCES "NoraConversationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoraConversationCase" ADD CONSTRAINT "NoraConversationCase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoraConversationCase" ADD CONSTRAINT "NoraConversationCase_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
