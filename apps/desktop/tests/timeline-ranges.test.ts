import { describe, expect, test } from "bun:test";
import type { Playback } from "@popcorn/sdk";
import { bufferSegments, downloadSegments } from "../src/features/player/timeline-ranges";

const range = (startByte: bigint, endByte: bigint): Playback["downloadedRanges"][number] => ({
  $typeName: "popcorn.v1.PlaybackDownloadRange",
  startByte,
  endByte,
});

describe("timeline availability", () => {
  test("keeps downloaded islands separate instead of filling gaps with the total percentage", () => {
    expect(
      downloadSegments([range(0n, 100n), range(400n, 600n), range(900n, 1000n)], 1000n),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 40, end: 60 },
      { start: 90, end: 100 },
    ]);
  });

  test("clips ranges to the selected file and handles missing metadata", () => {
    expect(downloadSegments([range(-10n, 20n), range(90n, 200n), range(50n, 40n)], 100n)).toEqual([
      { start: 0, end: 20 },
      { start: 90, end: 100 },
    ]);
    expect(downloadSegments([range(0n, 10n)], 0n)).toEqual([]);
    expect(downloadSegments([], 100n)).toEqual([]);
  });

  test("preserves large file offsets without converting bigint bytes to number first", () => {
    const size = 100_000_000_000_000_000n;
    expect(downloadSegments([range(size / 2n, size)], size)).toEqual([{ start: 50, end: 100 }]);
  });

  test("uses actual time ranges for decoded buffers and preserves gaps after seeking", () => {
    const entries = [
      [0, 10],
      [300, 325],
      [580, 605],
    ];
    const buffered: TimeRanges = {
      length: entries.length,
      start: (index) => entries[index]![0]!,
      end: (index) => entries[index]![1]!,
    };
    expect(bufferSegments(buffered, 600)).toEqual([
      { start: 0, end: (100 * 10) / 600 },
      { start: 50, end: (100 * 325) / 600 },
      { start: (100 * 580) / 600, end: 100 },
    ]);
    expect(bufferSegments(buffered, Number.NaN)).toEqual([]);
    expect(bufferSegments(buffered, 0)).toEqual([]);
  });
});
