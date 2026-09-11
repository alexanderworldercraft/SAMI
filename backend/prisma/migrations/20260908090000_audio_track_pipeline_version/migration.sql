-- Separate generation provenance from the AI disclosure/consent version.
ALTER TABLE `VideoAudioTrack` ADD COLUMN `PipelineVersion` VARCHAR(64) NULL;

-- Only proven links: do not infer from labels, current environment or dates.
UPDATE `VideoAudioTrack` AS track
JOIN `AiDubbingJob` AS job ON job.`AiDubbingJobID` = track.`AiDubbingJobID`
  AND job.`VideoID` = track.`VideoID`
SET track.`PipelineVersion` = job.`PipelineVersion`
WHERE track.`Origin` = 'AI_DUB' AND track.`PipelineVersion` IS NULL;
