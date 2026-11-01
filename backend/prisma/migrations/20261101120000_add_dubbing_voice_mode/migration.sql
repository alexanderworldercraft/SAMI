-- Historical jobs retain their profile's prompt policy; new requests choose a mode explicitly.
ALTER TABLE `AiDubbingJob` ADD COLUMN `VoiceMode` VARCHAR(16) NULL;
