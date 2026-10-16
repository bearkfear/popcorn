import { describe, expect, mock, test } from "bun:test";
import { createActor } from "xstate";
import { type MseStreamEvent, mseSessionMachine } from "../src/features/player/mse-session.machine";

describe("MSE stream ownership", () => {
  test("seek replaces a restored stream and ignores callbacks from the old stream", () => {
    const streams: {
      time: number;
      resume: boolean;
      notify: (event: MseStreamEvent) => void;
      release: ReturnType<typeof mock>;
    }[] = [];
    const fail = mock(() => {});
    const actor = createActor(mseSessionMachine, {
      input: {
        startSeconds: 12,
        fail,
        open: (time, resume, notify) => {
          const release = mock(() => {});
          streams.push({ time, resume, notify, release });
          return release;
        },
      },
    }).start();
    try {
      const first = streams[0]!;
      actor.send({ type: "SEEK", time: 20, resume: false });
      expect(streams).toHaveLength(1);
      first.notify({ type: "RESTORED" });
      actor.send({ type: "SEEK", time: 20, resume: false });
      expect(first.release).toHaveBeenCalledTimes(1);
      expect(streams).toHaveLength(2);
      expect(streams[1]!.time).toBe(20);
      expect(streams[1]!.resume).toBe(false);
      first.notify({ type: "FAIL", message: "obsolete error" });
      first.notify({ type: "RESTORED" });
      expect(actor.getSnapshot().matches({ active: "restoring" })).toBe(true);
      expect(fail).not.toHaveBeenCalled();
      streams[1]!.notify({ type: "RESTORED" });
      expect(actor.getSnapshot().matches({ active: "ready" })).toBe(true);
    } finally {
      actor.stop();
    }
    expect(streams[1]!.release).toHaveBeenCalledTimes(1);
  });

  test("failure releases the stream once and blocks further seeks", () => {
    const release = mock(() => {});
    const fail = mock(() => {});
    let notify: (event: MseStreamEvent) => void = () => {};
    const open = mock((_time: number, _resume: boolean, emit: typeof notify) => {
      notify = emit;
      return release;
    });
    const actor = createActor(mseSessionMachine, {
      input: { startSeconds: 0, fail, open },
    }).start();
    notify({ type: "FAIL", message: "decode failed" });
    expect(actor.getSnapshot().matches("failed")).toBe(true);
    expect(fail).toHaveBeenCalledWith("decode failed");
    expect(release).toHaveBeenCalledTimes(1);
    actor.send({ type: "SEEK", time: 30, resume: true });
    expect(open).toHaveBeenCalledTimes(1);
    actor.stop();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
