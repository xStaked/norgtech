-- AlterTable
ALTER TABLE "WhatsAppConversation" ADD COLUMN     "assignedToRole" "UserRole";

-- CreateIndex
CREATE INDEX "WhatsAppConversation_status_assignedToRole_idx" ON "WhatsAppConversation"("status", "assignedToRole");
