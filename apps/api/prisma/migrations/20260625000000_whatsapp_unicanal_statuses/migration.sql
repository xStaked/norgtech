CREATE TYPE "WhatsAppConversationStatus_new" AS ENUM (
  'nuevo',
  'pendiente',
  'en_gestion',
  'resuelto'
);

ALTER TABLE "WhatsAppConversation"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "WhatsAppConversation"
  ALTER COLUMN "status" TYPE "WhatsAppConversationStatus_new"
  USING (
    CASE "status"::text
      WHEN 'abierto' THEN 'en_gestion'
      WHEN 'cerrado' THEN 'resuelto'
      ELSE "status"::text
    END
  )::"WhatsAppConversationStatus_new";

ALTER TYPE "WhatsAppConversationStatus" RENAME TO "WhatsAppConversationStatus_old";
ALTER TYPE "WhatsAppConversationStatus_new" RENAME TO "WhatsAppConversationStatus";

ALTER TABLE "WhatsAppConversation"
  ALTER COLUMN "status" SET DEFAULT 'nuevo';

DROP TYPE "WhatsAppConversationStatus_old";
