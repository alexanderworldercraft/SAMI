ALTER TABLE `Utilisateur`
    ADD COLUMN `AuthVersion` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `PasswordChangeRequired` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `RecoveryPasswordExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `RecoveryPasswordUsedAt` DATETIME(3) NULL;

CREATE TABLE `UserSession` (
    `UserSessionID` VARCHAR(36) NOT NULL,
    `UtilisateurID` INTEGER NOT NULL,
    `AuthVersion` INTEGER NOT NULL,
    `Scope` VARCHAR(24) NOT NULL,
    `ExpiresAt` DATETIME(3) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `UserSession_UtilisateurID_idx`(`UtilisateurID`),
    INDEX `UserSession_ExpiresAt_idx`(`ExpiresAt`),
    PRIMARY KEY (`UserSessionID`),
    CONSTRAINT `UserSession_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PasswordRecovery` (
    `PasswordRecoveryID` VARCHAR(36) NOT NULL,
    `TokenHash` CHAR(64) NOT NULL,
    `UtilisateurID` INTEGER NOT NULL,
    `ExpiresAt` DATETIME(3) NOT NULL,
    `DeliveredAt` DATETIME(3) NULL,
    `ConsumedAt` DATETIME(3) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `PasswordRecovery_TokenHash_key`(`TokenHash`),
    INDEX `PasswordRecovery_UtilisateurID_ConsumedAt_idx`(`UtilisateurID`, `ConsumedAt`),
    INDEX `PasswordRecovery_ExpiresAt_idx`(`ExpiresAt`),
    PRIMARY KEY (`PasswordRecoveryID`),
    CONSTRAINT `PasswordRecovery_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SecurityRateLimit` (
    `KeyHash` CHAR(64) NOT NULL,
    `Count` INTEGER NOT NULL DEFAULT 0,
    `ResetAt` DATETIME(3) NOT NULL,
    INDEX `SecurityRateLimit_ResetAt_idx`(`ResetAt`),
    PRIMARY KEY (`KeyHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ExtensionAuthCode` ADD COLUMN `AuthVersion` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `ExtensionAccessToken` ADD COLUMN `AuthVersion` INTEGER NOT NULL DEFAULT 0;
