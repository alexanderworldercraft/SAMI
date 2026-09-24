CREATE TABLE `ExtensionAuthCode` (
  `ExtensionAuthCodeID` VARCHAR(36) NOT NULL,
  `CodeHash` CHAR(64) NOT NULL,
  `ClientID` VARCHAR(64) NOT NULL,
  `RedirectURI` VARCHAR(255) NOT NULL,
  `CodeChallenge` VARCHAR(128) NOT NULL,
  `ExtensionName` VARCHAR(100) NOT NULL,
  `UtilisateurID` INTEGER NOT NULL,
  `ExpiresAt` DATETIME(3) NOT NULL,
  `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ExtensionAuthCode_CodeHash_key`(`CodeHash`),
  INDEX `idx_extension_auth_code_user_expiry`(`UtilisateurID`, `ExpiresAt`),
  INDEX `idx_extension_auth_code_expiry`(`ExpiresAt`),
  PRIMARY KEY (`ExtensionAuthCodeID`),
  CONSTRAINT `ExtensionAuthCode_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ExtensionAccessToken` (
  `ExtensionAccessTokenID` VARCHAR(36) NOT NULL,
  `TokenHash` CHAR(64) NOT NULL,
  `ClientID` VARCHAR(64) NOT NULL,
  `ExtensionName` VARCHAR(100) NOT NULL,
  `UtilisateurID` INTEGER NOT NULL,
  `LastUsedAt` DATETIME(3) NULL,
  `ExpiresAt` DATETIME(3) NOT NULL,
  `RevokedAt` DATETIME(3) NULL,
  `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ExtensionAccessToken_TokenHash_key`(`TokenHash`),
  INDEX `idx_extension_token_user_status`(`UtilisateurID`, `RevokedAt`, `ExpiresAt`),
  INDEX `idx_extension_token_hash_status`(`TokenHash`, `RevokedAt`),
  PRIMARY KEY (`ExtensionAccessTokenID`),
  CONSTRAINT `ExtensionAccessToken_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
