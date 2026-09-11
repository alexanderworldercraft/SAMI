ALTER TABLE `AiDubbingJob`
  ADD COLUMN `VoiceProfileRelativePath` VARCHAR(512) NULL AFTER `PreviewRelativePath`,
  ADD COLUMN `VoiceProfileChecksum` CHAR(64) NULL AFTER `VoiceProfileRelativePath`,
  ADD COLUMN `SpeakerCount` INTEGER NULL AFTER `VoiceProfileChecksum`,
  ADD COLUMN `VoiceSamples` JSON NULL AFTER `SpeakerCount`;
