import { describe, expect, test } from "bun:test";
import { mediaChunks } from "../src/features/player/media-chunks";

describe("MSE append chunks", () => {
  test("splits coalesced fetch data without losing bytes or reading ahead", async () => {
    const bytes = Uint8Array.from({ length: 1024 * 1024 + 17 }, (_, i) => i % 251);
    let reads = 0;
    const reader = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          reads++;
          if (reads === 1) controller.enqueue(bytes);
          else controller.close();
        },
      },
      { highWaterMark: 0 },
    ).getReader();
    const chunks = mediaChunks(reader, new AbortController().signal);
    const received: number[] = [];
    for (let i = 0; i < 5; i++) {
      const chunk = await chunks.next();
      expect(chunk.done).toBe(false);
      if (chunk.done) throw new Error("missing bytes");
      expect(chunk.value.byteLength).toBeLessThanOrEqual(256 * 1024);
      received.push(...chunk.value);
      expect(reads).toBe(1);
    }
    expect(new Uint8Array(received)).toEqual(bytes);
    expect((await chunks.next()).done).toBe(true);
    reader.releaseLock();
  });

  test("repeated audio replacements stop consuming the old network chunk", async () => {
    for (let change = 0; change < 10; change++) {
      const controller = new AbortController();
      const reader = new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(stream) {
          stream.enqueue(new Uint8Array(2 * 1024 * 1024));
        },
      }).getReader();
      const chunks = mediaChunks(reader, controller.signal);
      expect((await chunks.next()).done).toBe(false);
      controller.abort();
      expect((await chunks.next()).done).toBe(true);
      await reader.cancel();
      reader.releaseLock();
    }
  });
});
