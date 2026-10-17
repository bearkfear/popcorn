import { assign, fromCallback, fromPromise, setup } from "xstate";
import type {
  CatalogClient,
  HistoryClient,
  PlaybackClient,
  SourceClient,
  StorageClient,
} from "../../shared/types";

export type Clients = {
  readonly history?: HistoryClient;
  readonly catalog?: CatalogClient;
  readonly source?: SourceClient;
  readonly playback?: PlaybackClient;
  readonly storage?: StorageClient;
};

type BootstrapResult = { clients: Clients; catalogVersion: string };
export type BootstrapServices = {
  readonly isDesktop: () => boolean;
  readonly bootstrap: (signal: AbortSignal) => Promise<BootstrapResult>;
  readonly listenForShutdown: (onError: (message: string) => void) => Promise<() => void>;
};

type BootstrapContext = {
  services: BootstrapServices;
  clients: Clients;
  catalogVersion: string;
  error: string;
};

type BootstrapEvent =
  | { type: "CONNECT" }
  | { type: "ERROR"; message: string }
  | { type: "SET_ERROR"; value: string | ((previous: string) => string) };

export const bootstrapMachine = setup({
  types: {
    context: {} as BootstrapContext,
    input: {} as BootstrapServices,
    events: {} as BootstrapEvent,
  },
  actors: {
    connect: fromPromise(
      async ({ input, signal }: { input: BootstrapServices; signal: AbortSignal }) =>
        input.bootstrap(signal),
    ),
    shutdown: fromCallback<BootstrapEvent, BootstrapServices>(({ input, sendBack }) => {
      if (!input.isDesktop()) return;
      let disposed = false;
      let unlisten: (() => void) | undefined;
      void input
        .listenForShutdown((message) => {
          if (!disposed) sendBack({ type: "ERROR", message });
        })
        .then((release) => {
          if (disposed) release();
          else unlisten = release;
        })
        .catch(() => {
          if (!disposed)
            sendBack({
              type: "ERROR",
              message: "Não foi possível acompanhar o encerramento do serviço local.",
            });
        });
      return () => {
        disposed = true;
        unlisten?.();
      };
    }),
  },
}).createMachine({
  id: "bootstrap",
  initial: "waiting",
  context: ({ input }) => ({ services: input, clients: {}, catalogVersion: "", error: "" }),
  invoke: { src: "shutdown", input: ({ context }) => context.services },
  on: {
    CONNECT: [
      {
        guard: ({ context }) => context.services.isDesktop(),
        target: ".connecting",
        actions: assign({ clients: {}, error: "" }),
      },
      { target: ".browser" },
    ],
    ERROR: { target: ".error", actions: assign({ error: ({ event }) => event.message }) },
    SET_ERROR: {
      actions: assign({
        error: ({ context, event }) =>
          typeof event.value === "function" ? event.value(context.error) : event.value,
      }),
    },
  },
  states: {
    waiting: {},
    connecting: {
      on: {
        CONNECT: {
          target: "connecting",
          reenter: true,
          actions: assign({ clients: {}, error: "" }),
        },
      },
      invoke: {
        id: "connect",
        src: "connect",
        input: ({ context }) => context.services,
        onDone: {
          target: "ready",
          actions: assign({
            clients: ({ event }) => event.output.clients,
            catalogVersion: ({ event }) => event.output.catalogVersion,
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: ({ context }) =>
              context.error ||
              "Não foi possível iniciar o serviço local. Tente conectar novamente.",
          }),
        },
      },
    },
    ready: {},
    error: {},
    browser: {},
  },
});
