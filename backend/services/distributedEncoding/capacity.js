const state = {
  active: 0,
  exclusive: false,
  maxSlots: 1,
  queue: [],
};

const dispatch = () => {
  if (state.exclusive || state.active >= state.maxSlots || state.queue.length === 0) return;
  if (state.queue[0].exclusive && state.active > 0) return;
  const waiter = state.queue.shift();
  state.active += 1;
  state.exclusive = waiter.exclusive;
  let released = false;
  waiter.resolve(() => {
    if (released) return;
    released = true;
    state.active = Math.max(0, state.active - 1);
    if (waiter.exclusive) state.exclusive = false;
    dispatch();
  });
  dispatch();
};

export function setEncodingMaxSlots(maxSlots) {
  const slots = Number(maxSlots);
  if (!Number.isInteger(slots) || slots < 1 || slots > 32) throw new TypeError("Nombre de slots invalide.");
  state.maxSlots = slots;
  dispatch();
}

export function acquireEncodingCapacity({ signal, wait = true, exclusive = true } = {}) {
  if (!wait && (state.exclusive || state.active >= state.maxSlots || (exclusive && state.active > 0) || state.queue.length > 0)) {
    return Promise.resolve(null);
  }
  if (signal?.aborted) return Promise.reject(signal.reason || new Error("cancelled"));

  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject, exclusive };
    const onAbort = () => {
      const index = state.queue.indexOf(waiter);
      if (index >= 0) state.queue.splice(index, 1);
      reject(signal.reason || new Error("cancelled"));
      dispatch();
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
  maxSlots: state.maxSlots,
});
