import { assign, fromCallback, setup } from "xstate";

export type MseStreamEvent = { type: "RESTORED" } | { type: "FAIL"; message: string };
type MseEvent = MseStreamEvent | { type: "SEEK"; time: number; resume: boolean };
type MseInput = {
  startSeconds: number;
  open: (time: number, resume: boolean, notify: (event: MseStreamEvent) => void) => () => void;
  fail: (message: string) => void;
};
type MseContext = MseInput & { time: number; resume: boolean };

// A stream owns its fetch, SourceBuffer and object URL until seek, failure or disposal.
export const mseSessionMachine = setup({
  types: {
    context: {} as MseContext,
    input: {} as MseInput,
    events: {} as MseEvent,
  },
  actors: {
    stream: fromCallback<MseEvent, MseContext>(({ input, sendBack }) =>
      input.open(input.time, input.resume, sendBack),
    ),
  },
}).createMachine({
  id: "mseSession",
  initial: "active",
  context: ({ input }) => ({ ...input, time: input.startSeconds, resume: true }),
  states: {
    active: {
      initial: "restoring",
      invoke: { src: "stream", input: ({ context }) => context },
      on: {
        FAIL: { target: "failed", actions: ({ context, event }) => context.fail(event.message) },
      },
      states: {
        restoring: { on: { RESTORED: "ready" } },
        ready: {
          on: {
            SEEK: {
              target: "#mseSession.active",
              reenter: true,
              actions: assign({
                time: ({ event }) => event.time,
                resume: ({ event }) => event.resume,
              }),
            },
          },
        },
      },
    },
    failed: {},
  },
});
