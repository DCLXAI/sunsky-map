-- CreateTable
CREATE TABLE "AiRequest" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRequest_ownerId_createdAt_idx" ON "AiRequest"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRequest_createdAt_idx" ON "AiRequest"("createdAt");
