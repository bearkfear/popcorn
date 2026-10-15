// ViewModel managing Tauri IPC bootstrap lifecycle and backend connection status.
import { createSignal, onCleanup } from "solid-js";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  createCatalogClient,
  createPlaybackClient,
  createSourceClient,
  createStorageClient,
} from "@popcorn/sdk";
import type {
  Bootstrap,
  CatalogClient,
  Connection,
  PlaybackClient,
  SourceClient,
  StorageClient,
} from "../../shared/types";

interface BootstrapSetters {
  setConnection: (c: Connection) => void;
  setConnectionError: (e: string | ((prev: string) => string)) => void;
  setCatalogVersion: (v: string) => void;
  setClients: (clients: {
    catalog?: CatalogClient;
    source?: SourceClient;
    playback?: PlaybackClient;
    storage?: StorageClient;
  }) => void;
}

interface BootstrapContext {
  gen: number;
  currentGen: () => number;
  isDisposed: () => boolean;
}

async function runBootstrap(
  ctx: BootstrapContext,
  setters: BootstrapSetters,
  onReady?: () => void
) {
  try {
    const data = await invoke<Bootstrap>("bootstrap");
    if (ctx.isDisposed() || ctx.currentGen() !== ctx.gen) return;
    const baseUrl = `http://${data.address}`;
    setters.setClients({
      catalog: createCatalogClient(baseUrl, data.token),
      source: createSourceClient(baseUrl, data.token),
      playback: createPlaybackClient(baseUrl, data.token),
      storage: createStorageClient(baseUrl, data.token),
    });
    setters.setCatalogVersion(data.catalogVersion);
    setters.setConnection("ready");
    onReady?.();
  } catch {
    if (ctx.isDisposed() || ctx.currentGen() !== ctx.gen) return;
    setters.setConnection("error");
    setters.setConnectionError((cur) => cur || "Não foi possível iniciar o serviço local. Tente conectar novamente.");
  }
}

export function createBootstrapViewModel() {
  const [connection, setConnection] = createSignal<Connection>("connecting");
  const [connectionError, setConnectionError] = createSignal("");
  const [catalogVersion, setCatalogVersion] = createSignal("");
  let clients = {};
  let generation = 0;
  let disposed = false;
  let unlistenShutdown: UnlistenFn | undefined;

  async function listenForShutdown() {
    try {
      unlistenShutdown = await listen<string>("backend-shutdown-error", (event) => {
        if (disposed) return;
        setConnection("error");
        setConnectionError(event.payload || "Não foi possível encerrar o serviço local.");
      });
    } catch {
      if (!disposed) {
        setConnection("error");
        setConnectionError("Não foi possível acompanhar o encerramento do serviço local.");
      }
    }
  }

  async function connect(onReady?: () => void) {
    if (!isTauri()) return setConnection("browser");
    const current = ++generation;
    setConnection("connecting");
    setConnectionError("");
    clients = {};
    const setters: BootstrapSetters = {
      setConnection,
      setConnectionError,
      setCatalogVersion,
      setClients: (c) => { clients = c; },
    };
    const ctx: BootstrapContext = {
      gen: current,
      currentGen: () => generation,
      isDisposed: () => disposed,
    };
    await runBootstrap(ctx, setters, onReady);
  }

  onCleanup(() => { disposed = true; unlistenShutdown?.(); });

  return {
    connection,
    connectionError,
    catalogVersion,
    getClients: () => clients,
    connect,
    listenForShutdown,
    setConnectionError,
  };
}

export type BootstrapViewModel = ReturnType<typeof createBootstrapViewModel>;
