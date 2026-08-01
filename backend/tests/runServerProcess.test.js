import { EventEmitter } from "events";

import { describe, expect, it, vi } from "vitest";

import { runServerProcess } from "../server/runServerProcess.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe("runServerProcess", () => {
  it("attend la fin du démarrage avant de fermer sur un signal précoce", async () => {
    const startup = deferred();
    const processRef = new EventEmitter();
    processRef.exitCode = undefined;
    const nativeServer = new EventEmitter();
    const server = {
      server: nativeServer,
      close: vi.fn(async () => nativeServer.emit("close")),
    };
    const logger = { info: vi.fn(), error: vi.fn() };

    const running = runServerProcess({ host: "127.0.0.1" }, {
      start: vi.fn(() => startup.promise),
      processRef,
      logger,
    });
    processRef.emit("SIGTERM");
    expect(server.close).not.toHaveBeenCalled();

    startup.resolve(server);
    await expect(running).resolves.toBe(server);

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(processRef.exitCode).toBe(0);
    expect(processRef.listenerCount("SIGINT")).toBe(0);
    expect(processRef.listenerCount("SIGTERM")).toBe(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("retire les listeners si le démarrage échoue", async () => {
    const processRef = new EventEmitter();
    const failure = new Error("listen failed");

    await expect(runServerProcess({}, {
      start: vi.fn(async () => { throw failure; }),
      processRef,
      logger: { info: vi.fn(), error: vi.fn() },
    })).rejects.toBe(failure);

    expect(processRef.listenerCount("SIGINT")).toBe(0);
    expect(processRef.listenerCount("SIGTERM")).toBe(0);
  });
});
