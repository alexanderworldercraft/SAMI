-- CreateTable
CREATE TABLE `Log` (
    `LogID` INTEGER NOT NULL AUTO_INCREMENT,
    `UtilisateurID` INTEGER NOT NULL,
    `ActionID` INTEGER NOT NULL,
    `DateAction` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`LogID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Action` (
    `ActionID` INTEGER NOT NULL AUTO_INCREMENT,
    `Nom` VARCHAR(191) NOT NULL,
    `Description` VARCHAR(191) NULL,
    `Criticite` INTEGER NULL,

    UNIQUE INDEX `Action_Nom_key`(`Nom`),
    PRIMARY KEY (`ActionID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Log` ADD CONSTRAINT `Log_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Log` ADD CONSTRAINT `Log_ActionID_fkey` FOREIGN KEY (`ActionID`) REFERENCES `Action`(`ActionID`) ON DELETE RESTRICT ON UPDATE CASCADE;
