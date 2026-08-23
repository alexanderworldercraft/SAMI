INSERT INTO `Action` (`Nom`, `Description`, `Criticite`, `CreateDate`) VALUES
    ('ai_subtitle_updated', 'Un administrateur corrige le texte ou les horodatages d''un sous-titre IA.', 2, CURRENT_TIMESTAMP(3)),
    ('ai_subtitle_deleted', 'Un administrateur supprime un sous-titre généré par IA.', 2, CURRENT_TIMESTAMP(3)),
    ('ai_subtitle_recreated', 'Un administrateur relance la transcription complète d''un sous-titre IA.', 2, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
    `Description` = VALUES(`Description`),
    `Criticite` = VALUES(`Criticite`);
