-- AlterTable
ALTER TABLE `Series` MODIFY `Premium` BOOLEAN NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Utilisateur` ALTER COLUMN `CreateDate` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Video` MODIFY `Premium` BOOLEAN NULL DEFAULT false;
