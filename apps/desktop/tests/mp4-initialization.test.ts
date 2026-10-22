import { expect, test } from "bun:test";
import { mp4Initialization } from "../src/features/player/mp4-initialization";

function box(type: string, payload: number[]) {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(
    [...type].map((letter) => letter.charCodeAt(0)),
    4,
  );
  bytes.set(payload, 8);
  return bytes;
}

async function* split(bytes: Uint8Array<ArrayBuffer>, size: number) {
  for (let offset = 0; offset < bytes.length; offset += size)
    yield bytes.slice(offset, offset + size);
}

test("Safari receives the complete ftyp and moov together even with one-byte HTTP chunks", async () => {
  const header = new Uint8Array([...box("ftyp", [1, 2, 3, 4]), ...box("moov", [5, 6, 7, 8])]);
  const fragment = new Uint8Array([...box("moof", [9, 10]), ...box("mdat", [11, 12, 13])]);
  const bytes = new Uint8Array([...header, ...fragment]);
  for (const size of [1, 7, 12, 16, bytes.length]) {
    const received: number[] = [];
    let first = true;
    for await (const chunk of mp4Initialization(split(bytes, size))) {
      if (first) expect(chunk).toEqual(header);
      first = false;
      received.push(...chunk);
    }
    expect(new Uint8Array(received)).toEqual(bytes);
  }
});

test("a truncated initialization fails rather than leaving the player waiting", async () => {
  const header = box("ftyp", [1, 2, 3, 4]);
  const stream = mp4Initialization(split(header, 3));
  await expect(stream.next()).rejects.toThrow("Incomplete MP4 initialization");
});

test("malformed initialization lengths cannot cause unbounded buffering", async () => {
  const header = box("moov", []);
  new DataView(header.buffer).setUint32(0, 16 * 1024 * 1024);
  await expect(mp4Initialization(split(header, 8)).next()).rejects.toThrow(
    "Invalid MP4 initialization box",
  );
});
