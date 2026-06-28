CREATE TABLE `Musique` (
    `MusiqueID` INTEGER NOT NULL AUTO_INCREMENT,
    `Titre` VARCHAR(100) NOT NULL,
    `CheminAcces` VARCHAR(255) NOT NULL,
    `CheminImage` VARCHAR(255) NULL,
    `Premium` BOOLEAN NOT NULL DEFAULT false,
    `EtatID` INTEGER NOT NULL,
    `UtilisateurID` INTEGER NULL,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Musique_EtatID_fkey`(`EtatID`),
    INDEX `Musique_UtilisateurID_fkey`(`UtilisateurID`),
    PRIMARY KEY (`MusiqueID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MusiqueGenre` (
    `MusiqueGenreID` INTEGER NOT NULL AUTO_INCREMENT,
    `Nom` VARCHAR(100) NOT NULL,
    `UtilisateurID` INTEGER NULL,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MusiqueGenre_UtilisateurID_fkey`(`UtilisateurID`),
    PRIMARY KEY (`MusiqueGenreID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MusiqueGenreMusique` (
    `MusiqueGenreMusiqueID` INTEGER NOT NULL AUTO_INCREMENT,
    `MusiqueID` INTEGER NOT NULL,
    `MusiqueGenreID` INTEGER NOT NULL,
    `UtilisateurID` INTEGER NULL,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_musique_genre_musique`(`MusiqueID`, `MusiqueGenreID`),
    INDEX `MusiqueGenreMusique_MusiqueID_fkey`(`MusiqueID`),
    INDEX `MusiqueGenreMusique_MusiqueGenreID_fkey`(`MusiqueGenreID`),
    INDEX `MusiqueGenreMusique_UtilisateurID_fkey`(`UtilisateurID`),
    PRIMARY KEY (`MusiqueGenreMusiqueID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Album` (
    `AlbumID` INTEGER NOT NULL AUTO_INCREMENT,
    `Titre` VARCHAR(100) NOT NULL,
    `CheminImage` VARCHAR(255) NULL,
    `EtatID` INTEGER NOT NULL,
    `UtilisateurID` INTEGER NULL,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Album_EtatID_fkey`(`EtatID`),
    INDEX `Album_UtilisateurID_fkey`(`UtilisateurID`),
    PRIMARY KEY (`AlbumID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AlbumMusique` (
    `AlbumMusiqueID` INTEGER NOT NULL AUTO_INCREMENT,
    `AlbumID` INTEGER NOT NULL,
    `MusiqueID` INTEGER NOT NULL,
    `UtilisateurID` INTEGER NULL,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_album_musique`(`AlbumID`, `MusiqueID`),
    INDEX `AlbumMusique_AlbumID_fkey`(`AlbumID`),
    INDEX `AlbumMusique_MusiqueID_fkey`(`MusiqueID`),
    INDEX `AlbumMusique_UtilisateurID_fkey`(`UtilisateurID`),
    PRIMARY KEY (`AlbumMusiqueID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MusiqueGenreAlbum` (
    `MusiqueGenreAlbumID` INTEGER NOT NULL AUTO_INCREMENT,
    `AlbumID` INTEGER NOT NULL,
    `MusiqueGenreID` INTEGER NOT NULL,
    `UtilisateurID` INTEGER NULL,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_album_musique_genre`(`AlbumID`, `MusiqueGenreID`),
    INDEX `MusiqueGenreAlbum_AlbumID_fkey`(`AlbumID`),
    INDEX `MusiqueGenreAlbum_MusiqueGenreID_fkey`(`MusiqueGenreID`),
    INDEX `MusiqueGenreAlbum_UtilisateurID_fkey`(`UtilisateurID`),
    PRIMARY KEY (`MusiqueGenreAlbumID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Musique` ADD CONSTRAINT `Musique_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat`(`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Musique` ADD CONSTRAINT `Musique_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MusiqueGenre` ADD CONSTRAINT `MusiqueGenre_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MusiqueGenreMusique` ADD CONSTRAINT `MusiqueGenreMusique_MusiqueID_fkey` FOREIGN KEY (`MusiqueID`) REFERENCES `Musique`(`MusiqueID`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MusiqueGenreMusique` ADD CONSTRAINT `MusiqueGenreMusique_MusiqueGenreID_fkey` FOREIGN KEY (`MusiqueGenreID`) REFERENCES `MusiqueGenre`(`MusiqueGenreID`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MusiqueGenreMusique` ADD CONSTRAINT `MusiqueGenreMusique_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Album` ADD CONSTRAINT `Album_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat`(`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Album` ADD CONSTRAINT `Album_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AlbumMusique` ADD CONSTRAINT `AlbumMusique_AlbumID_fkey` FOREIGN KEY (`AlbumID`) REFERENCES `Album`(`AlbumID`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AlbumMusique` ADD CONSTRAINT `AlbumMusique_MusiqueID_fkey` FOREIGN KEY (`MusiqueID`) REFERENCES `Musique`(`MusiqueID`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AlbumMusique` ADD CONSTRAINT `AlbumMusique_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `MusiqueGenreAlbum` ADD CONSTRAINT `MusiqueGenreAlbum_AlbumID_fkey` FOREIGN KEY (`AlbumID`) REFERENCES `Album`(`AlbumID`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MusiqueGenreAlbum` ADD CONSTRAINT `MusiqueGenreAlbum_MusiqueGenreID_fkey` FOREIGN KEY (`MusiqueGenreID`) REFERENCES `MusiqueGenre`(`MusiqueGenreID`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MusiqueGenreAlbum` ADD CONSTRAINT `MusiqueGenreAlbum_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE;
