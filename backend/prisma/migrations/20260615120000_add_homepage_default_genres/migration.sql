CREATE TABLE `HomepageDefaultGenre` (
  `HomepageDefaultGenreID` BIGINT NOT NULL AUTO_INCREMENT,
  `Position` INTEGER NOT NULL,
  `GenreID` INTEGER NOT NULL,
  `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `HomepageDefaultGenre_Position_key`(`Position`),
  INDEX `idx_homepage_default_genre`(`GenreID`),
  PRIMARY KEY (`HomepageDefaultGenreID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `HomepageDefaultGenre`
  ADD CONSTRAINT `HomepageDefaultGenre_GenreID_fkey`
  FOREIGN KEY (`GenreID`) REFERENCES `Genre`(`GenreID`) ON DELETE CASCADE ON UPDATE CASCADE;
