-- CreateEnum
CREATE TYPE "LauraMessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "LauraMessageKind" AS ENUM ('report', 'agenda_query', 'clarification', 'proposal');

-- CreateEnum
CREATE TYPE "LauraProposalStatus" AS ENUM ('draft', 'confirmed', 'discarded');

-- CreateTable
CREATE TABLE "LauraSession" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "contextType" TEXT,
    "contextEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LauraSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LauraMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "LauraMessageRole" NOT NULL,
    "kind" "LauraMessageKind" NOT NULL,
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LauraMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LauraProposal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "LauraProposalStatus" NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LauraProposal_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LauraMessage" ADD CONSTRAINT "LauraMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LauraSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LauraSession" ADD CONSTRAINT "LauraSession_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LauraProposal" ADD CONSTRAINT "LauraProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LauraSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LauraProposal" ADD CONSTRAINT "LauraProposal_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "LauraMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
