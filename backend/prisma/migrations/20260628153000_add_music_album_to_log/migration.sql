ALTER TABLE `Log` ADD COLUMN `MusiqueID` INTEGER NULL;
ALTER TABLE `Log` ADD COLUMN `AlbumID` INTEGER NULL;

CREATE INDEX `idx_log_musique_date` ON `Log`(`MusiqueID`, `DateAction`);
CREATE INDEX `idx_log_album_date` ON `Log`(`AlbumID`, `DateAction`);

ALTER TABLE `Log` ADD CONSTRAINT `fk_log_musique` FOREIGN KEY (`MusiqueID`) REFERENCES `Musique`(`MusiqueID`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Log` ADD CONSTRAINT `fk_log_album` FOREIGN KEY (`AlbumID`) REFERENCES `Album`(`AlbumID`) ON DELETE SET NULL ON UPDATE CASCADE;
