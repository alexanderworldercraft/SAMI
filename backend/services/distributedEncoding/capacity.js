const state = {
  active: 0,
  queue: [],
};

const dispatch = () => {
  if (state.active >= 1 || state.queue.length === 0) return;
  const waiter = state.queue.shift();
  state.active += 1;
  let released = false;
  waiter.resolve(() => {
    if (released) return;
    released = true;
    state.active = Math.max(0, state.active - 1);
    dispatch();
  });
};

export function acquireEncodingCapacity({ signal, wait = true } = {}) {
  if (!wait && (state.active >= 1 || state.queue.length > 0)) {
    return Promise.resolve(null);
  }
  if (signal?.aborted) return Promise.reject(signal.reason || new Error("cancelled"));

  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject };
    const onAbort = () => {
      const index = state.queue.indexOf(waiter);
      if (index >= 0) state.queue.splice(index, 1);
      reject(signal.reason || new Error("cancelled"));
    };
    if (signal) {
      waiter.resolve = (release) => {
        signal.removeEventListener("abort", onAbort);
        resolve(release);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
    state.queue.push(waiter);
    dispatch();
  });
}

export async function withEncodingCapacity(callback, options = {}) {
  const release = await acquireEncodingCapacity(options);
  if (!release) return null;
  try {
    return await callback();
  } finally {
    release();
  }
}

export const getEncodingCapacityState = () => ({
  active: state.active,
  queued: state.queue.length,
  maxSlots: 1,
});
