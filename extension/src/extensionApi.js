export function callExtensionApi(context, method, ...args) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const callback = (result) => {
      if (settled) return;
      settled = true;
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    };
    try {
      const returned = context[method](...args, callback);
      if (returned?.then) returned.then((result) => {
        if (!settled) { settled = true; resolve(result); }
      }, (error) => {
        if (!settled) { settled = true; reject(error); }
      });
    } catch (error) { reject(error); }
  });
}
