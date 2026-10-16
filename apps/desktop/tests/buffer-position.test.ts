import { describe, expect, test } from "bun:test";
import { bufferedPosition } from "../src/features/player/buffer-position";

function ranges(...entries: [number, number][]): TimeRanges {
  return {
    length: entries.length,
    start: (index) => entries[index]![0],
    end: (index) => entries[index]![1],
  };
}

describe("resume position", () => {
  test("resumes inside the first frame when the saved timestamp precedes it by 31 ms", () => {
    const position = bufferedPosition(ranges([836.8, 840]), 836.768752937);
    expect(position).toBeGreaterThan(836.8);
    expect(position).toBeLessThan(836.802);
  });

  test("keeps an already buffered position and handles codec priming at zero", () => {
    expect(bufferedPosition(ranges([830, 840]), 836.768752937)).toBe(836.768752937);
    expect(bufferedPosition(ranges([0.023, 2]), 0)).toBeCloseTo(0.024);
  });

  test("waits for missing data instead of jumping across substantial gaps", () => {
    expect(bufferedPosition(ranges(), 836)).toBeUndefined();
    expect(bufferedPosition(ranges([830, 835], [837, 840]), 836)).toBeUndefined();
    expect(bufferedPosition(ranges([830, 836]), 836)).toBeUndefined();
  });
});
