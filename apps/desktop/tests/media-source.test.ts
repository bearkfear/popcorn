import { describe, expect, test } from "bun:test";
import {
  type PlaybackMediaSource,
  playbackMediaSource,
  waitForStreaming,
} from "../src/features/player/media-source";

const type = 'video/mp4; codecs="avc1.640029, mp4a.40.2"';
const constructor = (supported: boolean) =>
  Object.assign(class {}, {
    isTypeSupported: (candidate: string) => supported && candidate === type,
  }) as unknown as typeof MediaSource;

describe("converted playback transport", () => {
  test("iPhone can use ManagedMediaSource without a MediaSource global", () => {
    const managed = constructor(true);
    const transport = playbackMediaSource(type, { ManagedMediaSource: managed });
    expect(transport?.constructor).toBe(managed);
    expect(transport?.kind).toBe("managed");
  });

  test("keeps standard MSE when supported and checks the exact codec on either API", () => {
    const standard = constructor(true);
    const managed = constructor(true);
    expect(
      playbackMediaSource(type, { MediaSource: standard, ManagedMediaSource: managed })?.kind,
    ).toBe("standard");
    expect(
      playbackMediaSource(type, { MediaSource: constructor(false), ManagedMediaSource: managed })
        ?.kind,
    ).toBe("managed");
    expect(
      playbackMediaSource("video/unsupported", {
        MediaSource: standard,
        ManagedMediaSource: managed,
      }),
    ).toBeUndefined();
    expect(playbackMediaSource(type, {})).toBeUndefined();
  });

  test("waits until Safari requests data and resumes when streaming starts", async () => {
    const source = Object.assign(new EventTarget(), { streaming: false });
    let reading = false;
    const pending = waitForStreaming(
      source as PlaybackMediaSource,
      new AbortController().signal,
    ).then(() => {
      reading = true;
    });
    await Promise.resolve();
    expect(reading).toBe(false);
    source.streaming = true;
    source.dispatchEvent(new Event("startstreaming"));
    await pending;
    expect(reading).toBe(true);
  });

  test("cancels a suspended stream when playback stops", async () => {
    const source = Object.assign(new EventTarget(), { streaming: false });
    const controller = new AbortController();
    const pending = waitForStreaming(source as PlaybackMediaSource, controller.signal);
    controller.abort(new Error("playback stopped"));
    await expect(pending).rejects.toThrow("playback stopped");
    await expect(
      waitForStreaming(source as PlaybackMediaSource, controller.signal),
    ).rejects.toThrow("playback stopped");
  });

  test("standard MSE does not wait for managed streaming events", async () => {
    await waitForStreaming(new EventTarget() as PlaybackMediaSource, new AbortController().signal);
  });
});
