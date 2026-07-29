ALTER TABLE `AdminMessage`
    ADD COLUMN `ExpiresAt` DATETIME(3) NULL;

UPDATE `AdminMessage`
SET `ExpiresAt` = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 7 DAY)
WHERE `Actif` = true;
