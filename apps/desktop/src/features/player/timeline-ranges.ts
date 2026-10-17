// Converts source byte ranges and decoded time ranges into separate timeline layers.
import type { Playback } from "@popcorn/sdk";

export type TimelineRange = { readonly start: number; readonly end: number };

// Source byte positions approximate time; only buffered TimeRanges are time accurate.
export function downloadSegments(
  ranges: Playback["downloadedRanges"],
  size: bigint,
): TimelineRange[] {
  if (size <= 0n) return [];
  return ranges.flatMap((range) => {
    const start = range.startByte < 0n ? 0n : range.startByte;
    const end = range.endByte > size ? size : range.endByte;
    if (end <= start) return [];
    return [{ start: percent(start, size), end: percent(end, size) }];
  });
}

function percent(value: bigint, size: bigint): number {
  return Number((value * 1_000_000n) / size) / 10_000;
}

export function bufferSegments(ranges: TimeRanges, duration: number): TimelineRange[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const segments: TimelineRange[] = [];
  for (let index = 0; index < ranges.length; index++) {
    const start = Math.max(0, ranges.start(index));
    const end = Math.min(duration, ranges.end(index));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      segments.push({ start: (100 * start) / duration, end: (100 * end) / duration });
    }
  }
  return segments;
}
