// Fetch chunks can grow while the consumer waits for playback to free buffer space.
// Bound each native append, preserving byte order across arbitrary MP4 box boundaries.
export async function* mediaChunks(
  reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array<ArrayBuffer>, void> {
  const maxBytes = 256 * 1024;
  while (!signal.aborted) {
    const chunk = await reader.read();
    if (signal.aborted || chunk.done) return;
    for (let offset = 0; offset < chunk.value.byteLength; offset += maxBytes) {
      if (signal.aborted) return;
      yield chunk.value.subarray(offset, offset + maxBytes);
    }
  }
}
