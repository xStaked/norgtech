-- Special price lists are owned by one user and versioned so a pending
-- revision never replaces the currently approved prices.
CREATE TABLE "SpecialPriceList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpecialPriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpecialPriceListRevision" (
    "id" TEXT NOT NULL,
    "specialPriceListId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "PriceListStatus" NOT NULL DEFAULT 'en_revision',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SpecialPriceListRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpecialPriceListCustomer" (
    "revisionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    CONSTRAINT "SpecialPriceListCustomer_pkey" PRIMARY KEY ("revisionId", "customerId")
);

CREATE TABLE "SpecialPriceListItem" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "priceSinIva" DECIMAL(14,2),
    "priceConIva" DECIMAL(14,2),
    "taxPercent" DECIMAL(5,2),
    CONSTRAINT "SpecialPriceListItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpecialPriceList_ownerUserId_name_key"
    ON "SpecialPriceList"("ownerUserId", "name");
CREATE UNIQUE INDEX "SpecialPriceListRevision_specialPriceListId_revision_key"
    ON "SpecialPriceListRevision"("specialPriceListId", "revision");
CREATE INDEX "SpecialPriceListRevision_specialPriceListId_active_idx"
    ON "SpecialPriceListRevision"("specialPriceListId", "active");
CREATE INDEX "SpecialPriceListRevision_status_active_idx"
    ON "SpecialPriceListRevision"("status", "active");
CREATE INDEX "SpecialPriceListCustomer_customerId_idx"
    ON "SpecialPriceListCustomer"("customerId");
CREATE UNIQUE INDEX "SpecialPriceListRevision_one_active_per_list_key"
    ON "SpecialPriceListRevision"("specialPriceListId")
    WHERE "active" = true;
CREATE UNIQUE INDEX "SpecialPriceListItem_revisionId_customerId_presentationId_key"
    ON "SpecialPriceListItem"("revisionId", "customerId", "presentationId");
CREATE INDEX "SpecialPriceListItem_customerId_presentationId_idx"
    ON "SpecialPriceListItem"("customerId", "presentationId");
CREATE UNIQUE INDEX "SpecialPriceListItem_one_active_per_owner_customer_presentation_key"
    ON "SpecialPriceListItem"("ownerUserId", "customerId", "presentationId")
    WHERE "active" = true;

ALTER TABLE "SpecialPriceList"
    ADD CONSTRAINT "SpecialPriceList_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListRevision"
    ADD CONSTRAINT "SpecialPriceListRevision_specialPriceListId_fkey"
    FOREIGN KEY ("specialPriceListId") REFERENCES "SpecialPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListRevision"
    ADD CONSTRAINT "SpecialPriceListRevision_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListRevision"
    ADD CONSTRAINT "SpecialPriceListRevision_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListCustomer"
    ADD CONSTRAINT "SpecialPriceListCustomer_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "SpecialPriceListRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListCustomer"
    ADD CONSTRAINT "SpecialPriceListCustomer_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListItem"
    ADD CONSTRAINT "SpecialPriceListItem_revisionId_fkey"
    FOREIGN KEY ("revisionId") REFERENCES "SpecialPriceListRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListItem"
    ADD CONSTRAINT "SpecialPriceListItem_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListItem"
    ADD CONSTRAINT "SpecialPriceListItem_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpecialPriceListItem"
    ADD CONSTRAINT "SpecialPriceListItem_presentationId_fkey"
    FOREIGN KEY ("presentationId") REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
