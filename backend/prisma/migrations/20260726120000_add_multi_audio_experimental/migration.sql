CREATE TABLE `VideoAudioTrack` (
  `VideoAudioTrackID` INTEGER NOT NULL AUTO_INCREMENT,
  `Label` VARCHAR(100) NOT NULL,
  `Language` VARCHAR(35) NULL,
  `CheminPlaylist` VARCHAR(255) NOT NULL,
  `IsDefault` BOOLEAN NOT NULL DEFAULT false,
  `Ordre` INTEGER NOT NULL,
  `VideoID` INTEGER NOT NULL,
  `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `VideoAudioTrack_VideoID_Ordre_key`(`VideoID`, `Ordre`),
  INDEX `VideoAudioTrack_VideoID_fkey`(`VideoID`),
  PRIMARY KEY (`VideoAudioTrackID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VideoAudioTrack`
  ADD CONSTRAINT `VideoAudioTrack_VideoID_fkey`
  FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `AppSetting` (`Cle`, `Valeur`)
VALUES ('multi_audio', JSON_OBJECT('active', false))
ON DUPLICATE KEY UPDATE `Cle` = `Cle`;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`)
VALUES (
  'multi_audio_toggle',
  'Changement d''état de la prise en charge expérimentale des pistes audio multiples.',
  1
)
ON DUPLICATE KEY UPDATE
  `Description` = VALUES(`Description`),
  `Criticite` = VALUES(`Criticite`);
