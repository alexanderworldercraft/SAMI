CREATE TABLE `AdminMessage` (
    `AdminMessageID` BIGINT NOT NULL AUTO_INCREMENT,
    `Titre` VARCHAR(150) NOT NULL,
    `Description` TEXT NOT NULL,
    `Actif` BOOLEAN NOT NULL DEFAULT false,
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`AdminMessageID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`)
VALUES
    ('admin_message_update', 'Maj du message général administrateur.', 1),
    ('admin_message_toggle', 'Changement d''état du toggle du message général administrateur.', 1)
ON DUPLICATE KEY UPDATE
    `Description` = VALUES(`Description`),
    `Criticite` = VALUES(`Criticite`);
