import { describe, expect, test } from "bun:test";
import { createActor } from "xstate";
import { playerMachine } from "../src/features/player/player.machine";

describe("player machine", () => {
  test("tracks playback through buffering, pause and seeking", () => {
    const actor = createActor(playerMachine).start();
    try {
      expect(actor.getSnapshot().value).toBe("idle");
      actor.send({ type: "prepare" });
      actor.send({ type: "buffer" });
      expect(actor.getSnapshot().value).toBe("buffering");
      actor.send({ type: "play" });
      actor.send({ type: "pause" });
      expect(actor.getSnapshot().value).toBe("paused");
      actor.send({ type: "seek" });
      expect(actor.getSnapshot().value).toBe("seeking");
      actor.send({ type: "buffer" });
      actor.send({ type: "play" });
      expect(actor.getSnapshot().value).toBe("playing");
    } finally {
      actor.stop();
    }
  });

  test("ignores invalid events and supports retry and reset after failure", () => {
    const actor = createActor(playerMachine).start();
    try {
      actor.send({ type: "play" });
      expect(actor.getSnapshot().value).toBe("idle");
      actor.send({ type: "prepare" });
      actor.send({ type: "fail" });
      actor.send({ type: "play" });
      expect(actor.getSnapshot().value).toBe("error");
      actor.send({ type: "prepare" });
      expect(actor.getSnapshot().value).toBe("preparing");
      actor.send({ type: "play" });
      actor.send({ type: "reset" });
      expect(actor.getSnapshot().value).toBe("idle");
    } finally {
      actor.stop();
    }
  });
});
