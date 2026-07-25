INSERT INTO `AppSetting` (`Cle`, `Valeur`)
VALUES ('preview_live', JSON_OBJECT('active', false))
ON DUPLICATE KEY UPDATE `Cle` = `Cle`;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`)
VALUES ('preview_live_toggle', 'Changement d''état de la prévisualisation au survol de la barre vidéo.', 1)
ON DUPLICATE KEY UPDATE
  `Description` = VALUES(`Description`),
  `Criticite` = VALUES(`Criticite`);
