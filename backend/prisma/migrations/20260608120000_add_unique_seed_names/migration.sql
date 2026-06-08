UPDATE `Series` s
JOIN `Etat` e ON e.`EtatID` = s.`EtatID`
JOIN (
    SELECT `Nom`, MIN(`EtatID`) AS `EtatID`
    FROM `Etat`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = e.`Nom`
SET s.`EtatID` = canonical.`EtatID`
WHERE s.`EtatID` <> canonical.`EtatID`;

UPDATE `Video` v
JOIN `Etat` e ON e.`EtatID` = v.`EtatID`
JOIN (
    SELECT `Nom`, MIN(`EtatID`) AS `EtatID`
    FROM `Etat`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = e.`Nom`
SET v.`EtatID` = canonical.`EtatID`
WHERE v.`EtatID` <> canonical.`EtatID`;

UPDATE `Utilisateur` u
JOIN `Etat` e ON e.`EtatID` = u.`EtatID`
JOIN (
    SELECT `Nom`, MIN(`EtatID`) AS `EtatID`
    FROM `Etat`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = e.`Nom`
SET u.`EtatID` = canonical.`EtatID`
WHERE u.`EtatID` <> canonical.`EtatID`;

DELETE e
FROM `Etat` e
JOIN (
    SELECT `Nom`, MIN(`EtatID`) AS `EtatID`
    FROM `Etat`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = e.`Nom`
WHERE e.`EtatID` <> canonical.`EtatID`;

DELETE gfc
FROM `GenreFeaturedContent` gfc
JOIN `Genre` g ON g.`GenreID` = gfc.`GenreID`
JOIN (
    SELECT `Nom`, MIN(`GenreID`) AS `GenreID`
    FROM `Genre`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = g.`Nom`
WHERE gfc.`GenreID` <> canonical.`GenreID`;

UPDATE `VideoGenre` vg
JOIN `Genre` g ON g.`GenreID` = vg.`GenreID`
JOIN (
    SELECT `Nom`, MIN(`GenreID`) AS `GenreID`
    FROM `Genre`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = g.`Nom`
SET vg.`GenreID` = canonical.`GenreID`
WHERE vg.`GenreID` <> canonical.`GenreID`;

UPDATE `SeriesGenre` sg
JOIN `Genre` g ON g.`GenreID` = sg.`GenreID`
JOIN (
    SELECT `Nom`, MIN(`GenreID`) AS `GenreID`
    FROM `Genre`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = g.`Nom`
SET sg.`GenreID` = canonical.`GenreID`
WHERE sg.`GenreID` <> canonical.`GenreID`;

UPDATE `UtilisateurGenre` ug
JOIN `Genre` g ON g.`GenreID` = ug.`GenreID`
JOIN (
    SELECT `Nom`, MIN(`GenreID`) AS `GenreID`
    FROM `Genre`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = g.`Nom`
SET ug.`GenreID` = canonical.`GenreID`
WHERE ug.`GenreID` <> canonical.`GenreID`;

DELETE g
FROM `Genre` g
JOIN (
    SELECT `Nom`, MIN(`GenreID`) AS `GenreID`
    FROM `Genre`
    GROUP BY `Nom`
) canonical ON canonical.`Nom` = g.`Nom`
WHERE g.`GenreID` <> canonical.`GenreID`;

ALTER TABLE `Etat` ADD UNIQUE INDEX `Etat_Nom_key`(`Nom`);
ALTER TABLE `Genre` ADD UNIQUE INDEX `Genre_Nom_key`(`Nom`);
