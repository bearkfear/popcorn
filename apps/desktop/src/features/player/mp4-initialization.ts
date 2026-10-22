// Give WebKit a complete initialization segment, independent of HTTP chunk boundaries.
export async function* mp4Initialization(
  chunks: AsyncIterable<Uint8Array<ArrayBuffer>>,
): AsyncGenerator<Uint8Array<ArrayBuffer>, void> {
  let pending: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let cursor = 0;
  let initialized = false;
  for await (const chunk of chunks) {
    if (initialized) {
      yield chunk;
      continue;
    }
    const joined = new Uint8Array(pending.byteLength + chunk.byteLength);
    joined.set(pending);
    joined.set(chunk, pending.byteLength);
    pending = joined;
    if (pending.byteLength > 8 * 1024 * 1024) throw new Error("MP4 initialization too large");
    while (pending.byteLength - cursor >= 8) {
      const view = new DataView(pending.buffer, cursor);
      let size = view.getUint32(0);
      let header = 8;
      if (size === 1) {
        if (pending.byteLength - cursor < 16) break;
        size = Number(view.getBigUint64(8));
        header = 16;
      }
      if (!Number.isSafeInteger(size) || size < header || size > 8 * 1024 * 1024)
        throw new Error("Invalid MP4 initialization box");
      if (pending.byteLength - cursor < size) break;
      const moov = view.getUint32(4) === 0x6d6f6f76;
      cursor += size;
      if (moov) {
        initialized = true;
        yield pending.subarray(0, cursor);
        if (pending.byteLength > cursor) yield pending.subarray(cursor);
        pending = new Uint8Array(0);
        break;
      }
    }
  }
  if (!initialized) throw new Error("Incomplete MP4 initialization");
}
