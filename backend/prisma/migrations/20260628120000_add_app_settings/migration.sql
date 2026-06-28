CREATE TABLE IF NOT EXISTS `AppSetting` (
  `AppSettingID` BIGINT NOT NULL AUTO_INCREMENT,
  `Cle` VARCHAR(120) NOT NULL,
  `Valeur` JSON NOT NULL,
  `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`AppSettingID`),
  UNIQUE INDEX `AppSetting_Cle_key`(`Cle`),
  INDEX `idx_app_setting_key`(`Cle`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `AppSetting` (`Cle`, `Valeur`)
VALUES ('content_preview_tooltip', JSON_OBJECT('active', false))
ON DUPLICATE KEY UPDATE `Cle` = `Cle`;
