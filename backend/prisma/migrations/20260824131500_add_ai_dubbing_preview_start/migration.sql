ALTER TABLE `AiDubbingJob`
  ADD COLUMN `PreviewStartSeconds` INTEGER NOT NULL DEFAULT 0 AFTER `Progress`;
