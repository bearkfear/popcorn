import { type Playback, type PlaybackQuality, PlaybackState } from "@popcorn/sdk";
import { assign, fromPromise, setup } from "xstate";
import type { PlaybackClient } from "../../shared/types";
import { diagnostic, errorDetails } from "./media-diagnostics";

export type PlaybackRequest = {
  readonly client: PlaybackClient;
  readonly sourceId: string;
  readonly fileIndex: number;
  readonly quality: PlaybackQuality;
  readonly audioStreamIndex: number | undefined;
  readonly position: number;
  readonly open: boolean;
};

type SessionContext = {
  request: PlaybackRequest | undefined;
  playback: Playback | undefined;
  error: string;
  monitorError: string;
};

type SessionEvent =
  | { type: "START"; request: PlaybackRequest }
  | { type: "CLOSE"; stop: boolean }
  | { type: "TOGGLE_DOWNLOAD" };

type ActiveSession = { client: PlaybackClient; playback: Playback };

function activeSession(context: SessionContext): ActiveSession {
  if (!context.request || !context.playback) throw new Error("playback session missing");
  return { client: context.request.client, playback: context.playback };
}

export const playbackSessionMachine = setup({
  types: {
    context: {} as SessionContext,
    events: {} as SessionEvent,
  },
  actors: {
    start: fromPromise(
      async ({ input, signal }: { input: PlaybackRequest; signal: AbortSignal }) => {
        const started = performance.now();
        const attemptId = crypto.randomUUID();
        diagnostic(
          "playback.start_requested",
          {},
          {
            attempt_id: attemptId,
            source_id: input.sourceId,
            file_index: input.fileIndex,
            quality: input.quality,
            audio_stream_index: input.audioStreamIndex,
            start_seconds: input.position,
            open_player: input.open,
          },
        );
        try {
          const response = await input.client.startPlayback(
            {
              sourceId: input.sourceId,
              fileIndex: input.fileIndex,
              quality: input.quality,
              idempotencyKey: attemptId,
              ...(input.audioStreamIndex !== undefined
                ? { audioStreamIndex: input.audioStreamIndex }
                : {}),
            },
            { signal, timeoutMs: 60_000 },
          );
          if (!response.playback) throw new Error("playback missing");
          diagnostic(
            "playback.start_response",
            { playbackId: response.playback.playbackId },
            {
              attempt_id: attemptId,
              elapsed_ms: Math.round(performance.now() - started),
              state: response.playback.state,
            },
          );
          return response.playback;
        } catch (error) {
          diagnostic(
            "playback.start_failed",
            {},
            {
              attempt_id: attemptId,
              elapsed_ms: Math.round(performance.now() - started),
              exception: errorDetails(error),
            },
          );
          throw error;
        }
      },
    ),
    poll: fromPromise(async ({ input, signal }: { input: ActiveSession; signal: AbortSignal }) => {
      try {
        const response = await input.client.getPlayback(
          { playbackId: input.playback.playbackId },
          { signal, timeoutMs: 5_000 },
        );
        if (!response.playback) throw new Error("playback missing");
        return response.playback;
      } catch (error) {
        diagnostic(
          "playback.poll_failed",
          { playbackId: input.playback.playbackId },
          errorDetails(error),
        );
        throw error;
      }
    }),
    toggleDownload: fromPromise(
      async ({ input, signal }: { input: ActiveSession; signal: AbortSignal }) => {
        const request = { playbackId: input.playback.playbackId };
        const options = { signal, timeoutMs: 10_000 };
        const response =
          input.playback.state === PlaybackState.PAUSED
            ? await input.client.resumePlayback(request, options)
            : await input.client.pausePlayback(request, options);
        if (!response.playback) throw new Error("playback missing");
        return response.playback;
      },
    ),
  },
  actions: {
    stopPlayback: ({ context, event }) => {
      const current = context.playback;
      const client = context.request?.client;
      if (!current || event.type !== "CLOSE") return;
      diagnostic("playback.closed", { playbackId: current.playbackId }, { stop: event.stop });
      if (event.stop && client) {
        void client.stopPlayback({ playbackId: current.playbackId }).catch((error: unknown) => {
          diagnostic(
            "playback.stop_failed",
            { playbackId: current.playbackId },
            errorDetails(error),
          );
        });
      }
    },
    clear: assign({ request: undefined, playback: undefined, error: "", monitorError: "" }),
    reportPlayback: ({ context }, { current }: { current: Playback }) => {
      const previous = context.playback;
      if (
        previous &&
        previous.playbackId === current.playbackId &&
        previous.state === current.state &&
        previous.conversion === current.conversion &&
        previous.error === current.error
      )
        return;
      diagnostic(
        "playback.state_changed",
        { playbackId: current.playbackId },
        {
          state: current.state,
          conversion: current.conversion,
          delivery: current.delivery,
          error: current.error,
          downloaded_bytes: String(current.downloadedBytes),
          total_bytes: String(current.totalBytes),
          duration_seconds: current.durationSeconds,
          stream_type: current.streamType,
          audio_stream_index: current.audioStreamIndex,
        },
      );
    },
  },
}).createMachine({
  id: "playbackSession",
  initial: "idle",
  context: { request: undefined, playback: undefined, error: "", monitorError: "" },
  on: {
    CLOSE: { target: ".idle", actions: ["stopPlayback", "clear"] },
    START: {
      target: ".starting",
      actions: assign({
        request: ({ event }) => event.request,
        playback: undefined,
        error: "",
        monitorError: "",
      }),
    },
  },
  states: {
    idle: {},
    starting: {
      on: { START: {} },
      invoke: {
        src: "start",
        input: ({ context }) => {
          if (!context.request) throw new Error("playback request missing");
          return context.request;
        },
        onDone: {
          target: "active",
          actions: [
            { type: "reportPlayback", params: ({ event }) => ({ current: event.output }) },
            assign({ playback: ({ event }) => event.output }),
          ],
        },
        onError: {
          target: "failed",
          actions: assign({
            error: "Não foi possível preparar o vídeo. A fonte pode estar indisponível.",
          }),
        },
      },
    },
    failed: {},
    active: {
      initial: "polling",
      on: { TOGGLE_DOWNLOAD: { target: ".mutating", actions: assign({ error: "" }) } },
      states: {
        polling: {
          invoke: {
            src: "poll",
            input: ({ context }) => activeSession(context),
            onDone: {
              target: "waiting",
              actions: [
                { type: "reportPlayback", params: ({ event }) => ({ current: event.output }) },
                assign({ playback: ({ event }) => event.output, monitorError: "" }),
              ],
            },
            onError: {
              target: "waiting",
              actions: assign({
                monitorError:
                  "Não foi possível atualizar o estado da reprodução. Tentando reconectar ao serviço.",
              }),
            },
          },
        },
        waiting: { after: { 1000: "polling" } },
        mutating: {
          on: { START: {}, TOGGLE_DOWNLOAD: {} },
          invoke: {
            src: "toggleDownload",
            input: ({ context }) => activeSession(context),
            onDone: {
              target: "waiting",
              actions: assign({ playback: ({ event }) => event.output }),
            },
            onError: {
              target: "waiting",
              actions: assign({ error: "Não foi possível alterar o estado do download." }),
            },
          },
        },
      },
    },
  },
});
