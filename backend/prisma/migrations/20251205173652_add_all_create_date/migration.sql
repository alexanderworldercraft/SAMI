/*
  Warnings:

  - Made the column `Premium` on table `Series` required. This step will fail if there are existing NULL values in that column.
  - Made the column `Premium` on table `Video` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `Action` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Etat` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Genre` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Grade` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Log` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Saison` MODIFY `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Series` MODIFY `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `Premium` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `SeriesGenre` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `SeriesPersonne` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Utilisateur` MODIFY `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    ALTER COLUMN `PremiumEndDate` DROP DEFAULT;

-- AlterTable
ALTER TABLE `UtilisateurGenre` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Video` MODIFY `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `Premium` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `VideoGenre` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `VideoPersonne` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `VideoSubtitle` ADD COLUMN `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3);
