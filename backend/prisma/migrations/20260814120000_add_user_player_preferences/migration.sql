CREATE TABLE `UserPlayerPreference` (
    `UtilisateurID` INTEGER NOT NULL,
    `AmbientLightEnabled` BOOLEAN NOT NULL DEFAULT true,
    `AmbientLightMode` VARCHAR(16) NOT NULL DEFAULT 'classic',
    `AmbientLightRefreshRate` INTEGER NOT NULL DEFAULT 6,
    `AmbientLightGridSize` INTEGER NOT NULL DEFAULT 3,
    `CreateDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdateDate` DATETIME(3) NOT NULL,

    PRIMARY KEY (`UtilisateurID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserPlayerPreference`
    ADD CONSTRAINT `UserPlayerPreference_UtilisateurID_fkey`
    FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`)
    ON DELETE CASCADE ON UPDATE CASCADE;
