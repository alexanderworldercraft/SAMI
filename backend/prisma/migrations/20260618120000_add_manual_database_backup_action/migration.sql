INSERT INTO `Action` (`Nom`, `Description`, `Criticite`)
VALUES
    ('manual_database_backup', 'Super administrateur lance une sauvegarde manuelle de la base de données.', 3)
ON DUPLICATE KEY UPDATE
    `Description` = VALUES(`Description`),
    `Criticite` = VALUES(`Criticite`);
