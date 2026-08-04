-- Pre-existing rows get an empty ownerId. Owner ids are always 64 hex
-- characters, so no visitor's cookie can ever match '' — the rows become
-- unreachable without being destroyed, and stay recoverable if their real
-- owner is ever identified.
-- AlterTable
ALTER TABLE "Project" ADD COLUMN "ownerId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ALTER COLUMN "ownerId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Project_ownerId_updatedAt_idx" ON "Project"("ownerId", "updatedAt");
