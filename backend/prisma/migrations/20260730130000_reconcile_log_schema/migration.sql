-- The richer Log structure existed on some installations after historical
-- `prisma db push`/manual synchronizations, but it was never captured in a
-- versioned migration. Every operation is conditional so this migration can
-- align both an incomplete clone and an already synchronized primary.

-- Columns
SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'VideoID'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `VideoID` INTEGER NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'SeriesID'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `SeriesID` INTEGER NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'SaisonID'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `SaisonID` INTEGER NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'Champ'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `Champ` VARCHAR(80) NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'AncienneValeur'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `AncienneValeur` TEXT NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'NouvelleValeur'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `NouvelleValeur` TEXT NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'Ip'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `Ip` VARCHAR(45) NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'UserAgent'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `UserAgent` VARCHAR(255) NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND COLUMN_NAME = 'Meta'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD COLUMN `Meta` JSON NULL'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

-- Composite indexes declared by schema.prisma.
SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND INDEX_NAME = 'idx_log_user_date'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_log_user_date` ON `Log`(`UtilisateurID`, `DateAction`)'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND INDEX_NAME = 'idx_log_action_date'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_log_action_date` ON `Log`(`ActionID`, `DateAction`)'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND INDEX_NAME = 'idx_log_video_date'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_log_video_date` ON `Log`(`VideoID`, `DateAction`)'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND INDEX_NAME = 'idx_log_series_date'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_log_series_date` ON `Log`(`SeriesID`, `DateAction`)'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND INDEX_NAME = 'idx_log_saison_date'
    ),
    'SELECT 1',
    'CREATE INDEX `idx_log_saison_date` ON `Log`(`SaisonID`, `DateAction`)'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

-- Optional content relations. New columns remain NULL for historical rows.
SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND CONSTRAINT_NAME = 'fk_log_video'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD CONSTRAINT `fk_log_video` FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND CONSTRAINT_NAME = 'fk_log_series'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD CONSTRAINT `fk_log_series` FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;

SET @sami_log_sql = IF(
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'Log'
          AND CONSTRAINT_NAME = 'fk_log_saison'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ),
    'SELECT 1',
    'ALTER TABLE `Log` ADD CONSTRAINT `fk_log_saison` FOREIGN KEY (`SaisonID`) REFERENCES `Saison`(`SaisonID`) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE sami_log_statement FROM @sami_log_sql;
EXECUTE sami_log_statement;
DEALLOCATE PREPARE sami_log_statement;
