const asTimestamp = (value) => {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
};

export const createVideoProcessingTimer = ({ now = () => Date.now() } = {}) => {
  const startedAtMs = asTimestamp(now());
  const startedAt = new Date(startedAtMs).toISOString();

  return {
    snapshot({ completed = false } = {}) {
      const measuredAtMs = Math.max(startedAtMs, asTimestamp(now()));

      return {
        processingStartedAt: startedAt,
        processingElapsedMs: measuredAtMs - startedAtMs,
        ...(completed
          ? { processingCompletedAt: new Date(measuredAtMs).toISOString() }
          : {}),
      };
    },
  };
};
