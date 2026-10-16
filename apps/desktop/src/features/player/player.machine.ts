import { createSignal, untrack } from "solid-js";

export type PlayerState =
  | "idle"
  | "preparing"
  | "buffering"
  | "playing"
  | "paused"
  | "seeking"
  | "error";

export type PlayerEvent = "prepare" | "buffer" | "play" | "pause" | "seek" | "fail" | "reset";

const transitions: Readonly<Record<PlayerState, Partial<Record<PlayerEvent, PlayerState>>>> = {
  idle: { prepare: "preparing", fail: "error", reset: "idle" },
  preparing: { buffer: "buffering", play: "playing", fail: "error", reset: "idle" },
  buffering: { play: "playing", pause: "paused", seek: "seeking", fail: "error", reset: "idle" },
  playing: { buffer: "buffering", pause: "paused", seek: "seeking", fail: "error", reset: "idle" },
  paused: { play: "playing", seek: "seeking", fail: "error", reset: "idle" },
  seeking: { buffer: "buffering", play: "playing", pause: "paused", fail: "error", reset: "idle" },
  error: { prepare: "preparing", reset: "idle" },
};

export function createPlayerMachine() {
  const [state, setState] = createSignal<PlayerState>("idle");

  function send(event: PlayerEvent) {
    const next = transitions[untrack(state)][event];
    if (next) setState(next);
  }

  return { state, send };
}
