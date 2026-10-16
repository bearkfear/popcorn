// Finds a playable resume point, allowing small gaps caused by frame rounding and codec priming.
export function bufferedPosition(ranges: TimeRanges, requested: number): number | undefined {
  for (let index = 0; index < ranges.length; index++) {
    const start = ranges.start(index);
    const end = ranges.end(index);
    if (start <= requested && requested < end) return requested;
    if (start > requested && start - requested <= 0.1 && end > start) {
      return Math.min(start + 0.001, (start + end) / 2);
    }
  }
  return undefined;
}
