// LAN HTTP pages lack randomUUID but still need valid playback idempotency keys.
import { expect, test } from "bun:test";
import { randomId } from "../src/shared/random-id";

test("playback identifiers work without the secure-context UUID API", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { getRandomValues: original.getRandomValues.bind(original) },
  });
  try {
    const first = randomId();
    const second = randomId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
