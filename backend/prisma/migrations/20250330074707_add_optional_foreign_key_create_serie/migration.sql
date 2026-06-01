-- AlterTable
ALTER TABLE `Series` ADD COLUMN `CreateDate` DATETIME(3) NULL,
    ADD COLUMN `UtilisateurID` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Series` ADD CONSTRAINT `Series_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE;
