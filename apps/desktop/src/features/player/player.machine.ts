import { useMachine } from "@xstate/solid";
import { type SnapshotFrom, setup } from "xstate";

export type PlayerEvent = "prepare" | "buffer" | "play" | "pause" | "seek" | "fail" | "reset";

export const playerMachine = setup({
  types: {
    events: {} as { type: PlayerEvent },
  },
}).createMachine({
  id: "player",
  initial: "idle",
  states: {
    idle: { on: { prepare: "preparing", fail: "error", reset: "idle" } },
    preparing: { on: { buffer: "buffering", play: "playing", fail: "error", reset: "idle" } },
    buffering: {
      on: { play: "playing", pause: "paused", seek: "seeking", fail: "error", reset: "idle" },
    },
    playing: {
      on: { buffer: "buffering", pause: "paused", seek: "seeking", fail: "error", reset: "idle" },
    },
    paused: { on: { play: "playing", seek: "seeking", fail: "error", reset: "idle" } },
    seeking: {
      on: { buffer: "buffering", play: "playing", pause: "paused", fail: "error", reset: "idle" },
    },
    error: { on: { prepare: "preparing", reset: "idle" } },
  },
});

export type PlayerState = SnapshotFrom<typeof playerMachine>["value"];

export function createPlayerMachine() {
  const [snapshot, send] = useMachine(playerMachine);
  return {
    state: (): PlayerState => snapshot.value,
    send: (event: PlayerEvent) => send({ type: event }),
  };
}
