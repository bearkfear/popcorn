import { describe, expect, mock, test } from "bun:test";
import {
  type Playback,
  PlaybackQuality,
  PlaybackState,
  type StartPlaybackResponse,
} from "@popcorn/sdk";
import { createActor, SimulatedClock, waitFor } from "xstate";
import {
  type PlaybackRequest,
  playbackSessionMachine,
} from "../src/features/player/playback-session.machine";
import type { PlaybackClient } from "../src/shared/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const playback = (id: string, state = PlaybackState.READY): Playback => ({
  $typeName: "popcorn.v1.Playback",
  playbackId: id,
  state,
  mediaUrl: "",
  sizeBytes: 0n,
  mimeType: "",
  downloadedBytes: 0n,
  totalBytes: 0n,
  downloadBytesPerSecond: 0n,
  peers: 0,
  durationSeconds: 0,
  delivery: "",
  conversion: "",
  streamType: "",
  error: "",
  timestampOffsetSeconds: 0,
  audioTracks: [],
});
const flush = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
function fixture(overrides: Partial<PlaybackClient> = {}) {
  const client = {
    startPlayback: mock(async () => ({ playback: playback("one") })),
    getPlayback: mock(async () => ({ playback: playback("one") })),
    stopPlayback: mock(async () => ({})),
    pausePlayback: mock(async () => ({ playback: playback("one", PlaybackState.PAUSED) })),
    resumePlayback: mock(async () => ({ playback: playback("one") })),
    ...overrides,
  } as unknown as PlaybackClient;
  const request: PlaybackRequest = {
    client,
    sourceId: "source",
    fileIndex: 0,
    quality: PlaybackQuality.AUTO,
    audioStreamIndex: undefined,
    position: 0,
    open: false,
  };
  const clock = new SimulatedClock();
  const actor = createActor(playbackSessionMachine, { clock }).start();
  return { client, request, clock, actor };
}

describe("playback session lifecycle", () => {
  test("close aborts preparation and ignores its late response after a new session starts", async () => {
    const old = deferred<StartPlaybackResponse>();
    let signal: AbortSignal | undefined;
    let calls = 0;
    const f = fixture({
      startPlayback: async (_request, options) => {
        calls++;
        if (calls === 1) {
          signal = options?.signal;
          return old.promise;
        }
        return { $typeName: "popcorn.v1.StartPlaybackResponse", playback: playback("two") };
      },
      getPlayback: async () => ({ playback: playback("two") }) as never,
    });
    try {
      f.actor.send({ type: "START", request: f.request });
      f.actor.send({ type: "START", request: f.request });
      expect(calls).toBe(1);
      f.actor.send({ type: "CLOSE", stop: true });
      expect(signal?.aborted).toBe(true);
      f.actor.send({ type: "START", request: f.request });
      await waitFor(f.actor, (state) => state.matches({ active: "waiting" }));
      old.resolve({
        $typeName: "popcorn.v1.StartPlaybackResponse",
        playback: playback("obsolete"),
      });
      await flush();
      expect(f.actor.getSnapshot().context.playback?.playbackId).toBe("two");
    } finally {
      f.actor.stop();
    }
  });

  test("poll errors preserve playback, recover and leave no timer after close", async () => {
    let fail = true;
    let polls = 0;
    const f = fixture({
      getPlayback: async () => {
        polls++;
        if (fail) throw new Error("offline");
        return { playback: playback("one") } as never;
      },
    });
    try {
      f.actor.send({ type: "START", request: f.request });
      await waitFor(f.actor, (state) => state.matches({ active: "waiting" }));
      expect(f.actor.getSnapshot().context.monitorError).not.toBe("");
      expect(f.actor.getSnapshot().context.playback?.playbackId).toBe("one");
      fail = false;
      f.clock.increment(1000);
      await waitFor(f.actor, (state) => state.matches({ active: "waiting" }));
      expect(f.actor.getSnapshot().context.monitorError).toBe("");
      f.actor.send({ type: "CLOSE", stop: false });
      f.clock.increment(10_000);
      expect(polls).toBe(2);
      expect(f.client.stopPlayback).not.toHaveBeenCalled();
      expect(f.actor.getSnapshot().context.playback).toBeUndefined();
    } finally {
      f.actor.stop();
    }
  });

  test("download changes cancel an older poll and close aborts an in-flight mutation", async () => {
    const poll = deferred<{ playback: ReturnType<typeof playback> }>();
    const pause = deferred<{ playback: ReturnType<typeof playback> }>();
    let pollSignal: AbortSignal | undefined;
    let mutationSignal: AbortSignal | undefined;
    const f = fixture({
      getPlayback: async (_request, options) => {
        pollSignal = options?.signal;
        return poll.promise as never;
      },
      pausePlayback: async (_request, options) => {
        mutationSignal = options?.signal;
        return pause.promise as never;
      },
    });
    try {
      f.actor.send({ type: "START", request: f.request });
      await waitFor(f.actor, (state) => state.matches({ active: "polling" }));
      f.actor.send({ type: "TOGGLE_DOWNLOAD" });
      expect(pollSignal?.aborted).toBe(true);
      poll.resolve({ playback: playback("obsolete") });
      await flush();
      expect(f.actor.getSnapshot().context.playback?.playbackId).toBe("one");
      f.actor.send({ type: "CLOSE", stop: true });
      expect(mutationSignal?.aborted).toBe(true);
      expect(f.client.stopPlayback).toHaveBeenCalledWith({ playbackId: "one" });
      pause.resolve({ playback: playback("one", PlaybackState.PAUSED) });
      await flush();
      expect(f.actor.getSnapshot().matches("idle")).toBe(true);
      expect(f.actor.getSnapshot().context.playback).toBeUndefined();
    } finally {
      f.actor.stop();
    }
  });

  test("pause and resume update the download while rejecting duplicate mutations", async () => {
    const f = fixture();
    try {
      f.actor.send({ type: "START", request: f.request });
      await waitFor(f.actor, (state) => state.matches({ active: "waiting" }));
      f.actor.send({ type: "TOGGLE_DOWNLOAD" });
      f.actor.send({ type: "TOGGLE_DOWNLOAD" });
      await waitFor(f.actor, (state) => state.matches({ active: "waiting" }));
      expect(f.actor.getSnapshot().context.playback?.state).toBe(PlaybackState.PAUSED);
      expect(f.client.pausePlayback).toHaveBeenCalledTimes(1);
      f.actor.send({ type: "TOGGLE_DOWNLOAD" });
      await waitFor(f.actor, (state) => state.matches({ active: "waiting" }));
      expect(f.actor.getSnapshot().context.playback?.state).toBe(PlaybackState.READY);
      expect(f.client.resumePlayback).toHaveBeenCalledTimes(1);
    } finally {
      f.actor.stop();
    }
  });

  test("failed preparation can be retried and actor disposal aborts polling", async () => {
    let fail = true;
    let signal: AbortSignal | undefined;
    const f = fixture({
      startPlayback: async () => {
        if (fail) throw new Error("unavailable");
        return { playback: playback("one") } as never;
      },
      getPlayback: async (_request, options) => {
        signal = options?.signal;
        return new Promise(() => {});
      },
    });
    f.actor.send({ type: "START", request: f.request });
    await waitFor(f.actor, (state) => state.matches("failed"));
    expect(f.actor.getSnapshot().context.error).not.toBe("");
    fail = false;
    f.actor.send({ type: "START", request: f.request });
    await waitFor(f.actor, (state) => state.matches({ active: "polling" }));
    expect(f.actor.getSnapshot().context.error).toBe("");
    f.actor.stop();
    expect(signal?.aborted).toBe(true);
  });
});
