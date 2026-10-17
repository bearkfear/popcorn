import {
  createCatalogClient,
  createHistoryClient,
  createPlaybackClient,
  createSourceCatalogClient,
  createSourceClient,
  createStorageClient,
} from "@popcorn/sdk";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMachine } from "@xstate/solid";
import { waitFor } from "xstate";
import type { Bootstrap, Connection } from "../../shared/types";
import { bootstrapMachine } from "./bootstrap.machine";

export function createBootstrapViewModel() {
  const [snapshot, send, actor] = useMachine(bootstrapMachine, {
    input: {
      isDesktop: isTauri,
      bootstrap: async (signal) => {
        const data = await invoke<Bootstrap>("bootstrap");
        signal.throwIfAborted();
        const baseUrl = `http://${data.address}`;
        return {
          clients: {
            history: createHistoryClient(baseUrl, data.token),
            catalog: createCatalogClient(baseUrl, data.token),
            source: createSourceClient(baseUrl, data.token),
            sourceCatalog: createSourceCatalogClient(baseUrl, data.token),
            playback: createPlaybackClient(baseUrl, data.token),
            storage: createStorageClient(baseUrl, data.token),
          },
          catalogVersion: data.catalogVersion,
        };
      },
      listenForShutdown: (onError) =>
        listen<string>("backend-shutdown-error", (event) => {
          onError(event.payload || "Não foi possível encerrar o serviço local.");
        }),
    },
  });

  async function connect(onReady?: () => void) {
    if (actor.getSnapshot().status === "stopped") return;
    send({ type: "CONNECT" });
    // Each invocation has its own actor; a replacement connection invalidates this waiter.
    const actorId = "connect";
    const attempt = actor.getSnapshot().children[actorId];
    const result = await waitFor(
      actor,
      (state) => !state.matches("connecting") || state.children[actorId] !== attempt,
    ).catch((cause: unknown) => {
      if (actor.getSnapshot().status !== "stopped") throw cause;
      return undefined;
    });
    if (result?.matches("ready") && actor.getSnapshot() === result) onReady?.();
  }

  return {
    connection: (): Connection => (snapshot.value === "waiting" ? "connecting" : snapshot.value),
    connectionError: () => snapshot.context.error,
    catalogVersion: () => snapshot.context.catalogVersion,
    getClients: () => snapshot.context.clients,
    connect,
    setConnectionError: (value: string | ((previous: string) => string)) =>
      send({ type: "SET_ERROR", value }),
  };
}

export type BootstrapViewModel = ReturnType<typeof createBootstrapViewModel>;
