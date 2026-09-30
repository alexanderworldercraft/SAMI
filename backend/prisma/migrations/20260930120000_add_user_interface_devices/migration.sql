CREATE TABLE `UserInterfacePreference` (
    `UtilisateurID` INTEGER NOT NULL,
    `Accepted` BOOLEAN NOT NULL,
    `CreateDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdateDate` DATETIME(3) NOT NULL,

    PRIMARY KEY (`UtilisateurID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserDevice` (
    `UserDeviceID` INTEGER NOT NULL AUTO_INCREMENT,
    `UtilisateurID` INTEGER NOT NULL,
    `DeviceKey` VARCHAR(36) NOT NULL,
    `Nom` VARCHAR(100) NOT NULL,
    `Type` VARCHAR(16) NOT NULL,
    `InterfaceMode` VARCHAR(16) NOT NULL,
    `CreateDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdateDate` DATETIME(3) NOT NULL,
    `LastUsedDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserDevice_UtilisateurID_DeviceKey_key`(`UtilisateurID`, `DeviceKey`),
    PRIMARY KEY (`UserDeviceID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserInterfacePreference` ADD CONSTRAINT `UserInterfacePreference_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserDevice` ADD CONSTRAINT `UserDevice_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE CASCADE ON UPDATE CASCADE;
