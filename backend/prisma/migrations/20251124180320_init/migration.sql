/*
  Warnings:

  - The primary key for the `Log` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE `Log` DROP PRIMARY KEY,
    MODIFY `LogID` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`LogID`);
