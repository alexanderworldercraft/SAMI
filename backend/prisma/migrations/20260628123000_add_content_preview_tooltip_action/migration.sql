INSERT INTO `Action` (`Nom`, `Description`, `Criticite`)
VALUES
    ('content_preview_tooltip_toggle', 'Changement d''état du tooltip de prévisualisation vidéo.', 1)
ON DUPLICATE KEY UPDATE
    `Description` = VALUES(`Description`),
    `Criticite` = VALUES(`Criticite`);
