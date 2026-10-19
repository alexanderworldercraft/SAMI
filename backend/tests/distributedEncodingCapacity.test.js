import { afterEach, describe, expect, it } from "vitest";
import { acquireEncodingCapacity, getEncodingCapacityState, setEncodingMaxSlots } from "../services/distributedEncoding/capacity.js";

afterEach(() => setEncodingMaxSlots(1));

describe("capacité d’encodage configurable", () => {
  it("ouvre deux slots distribués et garde l’encodage classique exclusif", async () => {
    setEncodingMaxSlots(2);
    const first = await acquireEncodingCapacity({ wait: false, exclusive: false });
    const second = await acquireEncodingCapacity({ wait: false, exclusive: false });
    expect(first).toBeTypeOf("function");
    expect(second).toBeTypeOf("function");
    expect(await acquireEncodingCapacity({ wait: false, exclusive: false })).toBeNull();
    expect(await acquireEncodingCapacity({ wait: false })).toBeNull();
    first(); second();
    const classic = await acquireEncodingCapacity({ wait: false });
    expect(await acquireEncodingCapacity({ wait: false, exclusive: false })).toBeNull();
    classic();
    expect(getEncodingCapacityState().active).toBe(0);
  });

  it("respecte une baisse de capacité sans interrompre les tâches déjà lancées", async () => {
    setEncodingMaxSlots(2);
    const first = await acquireEncodingCapacity({ exclusive: false });
    const second = await acquireEncodingCapacity({ exclusive: false });
    setEncodingMaxSlots(1);
    first();
    expect(await acquireEncodingCapacity({ wait: false, exclusive: false })).toBeNull();
    second();
    const next = await acquireEncodingCapacity({ wait: false, exclusive: false });
    expect(next).toBeTypeOf("function");
    next();
  });
});
