-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyPlan" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "parsedData" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "BuyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoUpload" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "parsedData" JSONB,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "PoUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comparison" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "buyPlanId" TEXT NOT NULL,

    CONSTRAINT "Comparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonPoUpload" (
    "comparisonId" TEXT NOT NULL,
    "poUploadId" TEXT NOT NULL,

    CONSTRAINT "ComparisonPoUpload_pkey" PRIMARY KEY ("comparisonId","poUploadId")
);

-- CreateTable
CREATE TABLE "ComparisonItem" (
    "id" TEXT NOT NULL,
    "comparisonId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "isUnmatched" BOOLEAN NOT NULL DEFAULT false,
    "poData" JSONB,
    "buyPlanData" JSONB,
    "discrepancies" JSONB,

    CONSTRAINT "ComparisonItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ComparisonItem_comparisonId_idx" ON "ComparisonItem"("comparisonId");

-- CreateIndex
CREATE INDEX "ComparisonItem_sku_idx" ON "ComparisonItem"("sku");

-- AddForeignKey
ALTER TABLE "BuyPlan" ADD CONSTRAINT "BuyPlan_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoUpload" ADD CONSTRAINT "PoUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_buyPlanId_fkey" FOREIGN KEY ("buyPlanId") REFERENCES "BuyPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonPoUpload" ADD CONSTRAINT "ComparisonPoUpload_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonPoUpload" ADD CONSTRAINT "ComparisonPoUpload_poUploadId_fkey" FOREIGN KEY ("poUploadId") REFERENCES "PoUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonItem" ADD CONSTRAINT "ComparisonItem_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "Comparison"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
