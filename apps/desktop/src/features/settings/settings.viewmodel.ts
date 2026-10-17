// ViewModel handling TMDB credentials and storage cache settings.

import { ConnectError, type TmdbStatus } from "@popcorn/sdk";
import { createResource, createSignal } from "solid-js";
import { catalogErrorText, needsConfiguration } from "../../catalog-ui";
import type { CatalogClient, SourceCatalogClient, StorageClient } from "../../shared/types";
import { createSourceCatalogViewModel } from "./source-catalog.viewmodel";

type StatusRequest = {
  readonly client: CatalogClient;
  readonly settled: (status?: TmdbStatus) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

function createTmdbSubViewModel(getCatalogClient: () => CatalogClient | undefined) {
  const [statusRequest, setStatusRequest] = createSignal<StatusRequest>();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [configurationBusy, setConfigurationBusy] = createSignal(false);
  const [configurationError, setConfigurationError] = createSignal("");
  const [remember, setRemember] = createSignal(true);

  const [statusResource, statusActions] = createResource(statusRequest, async (request) => {
    let loaded: TmdbStatus | undefined;
    try {
      const response = await request.client.getTmdbStatus({}, { timeoutMs: 10_000 });
      if (!response.status) throw new Error("O serviço não retornou o status do TMDB.");
      loaded = response.status;
      return loaded;
    } catch {
      setSettingsOpen(true);
      throw new Error("Não foi possível verificar a configuração do TMDB.");
    } finally {
      request.settled(loaded);
    }
  });

  function refreshStatus(): Promise<TmdbStatus | undefined> {
    const client = getCatalogClient();
    if (!client) return Promise.resolve(undefined);
    return new Promise((settled) => {
      setStatusRequest({ client, settled });
    });
  }

  async function saveToken(token: string): Promise<boolean> {
    const client = getCatalogClient();
    if (!client || configurationBusy()) return false;
    setConfigurationBusy(true);
    setConfigurationError("");
    try {
      const response = await client.configureTmdb(
        { readAccessToken: token, remember: remember() },
        { timeoutMs: 15_000 },
      );
      if (response.status?.configured) {
        statusActions.mutate(response.status);
        setSettingsOpen(false);
        return true;
      }
      setConfigurationError("O serviço não confirmou a configuração TMDB. Tente novamente.");
    } catch (error) {
      setConfigurationError(catalogErrorText(error, true));
    } finally {
      setConfigurationBusy(false);
    }
    return false;
  }

  async function clearConfiguration(): Promise<boolean> {
    const client = getCatalogClient();
    if (!client || configurationBusy()) return false;
    setConfigurationBusy(true);
    setConfigurationError("");
    try {
      const response = await client.clearTmdbConfiguration({}, { timeoutMs: 10_000 });
      if (!response.status) {
        setConfigurationError("O serviço não confirmou a remoção da configuração.");
        return false;
      }
      statusActions.mutate(response.status);
      setSettingsOpen(true);
      if (response.status.configured) {
        setConfigurationError(
          "A credencial do ambiente continua ativa. Para removê-la, altere TMDB_READ_ACCESS_TOKEN fora do aplicativo.",
        );
      }
      return true;
    } catch (error) {
      setConfigurationError(catalogErrorText(error, true));
      return false;
    } finally {
      setConfigurationBusy(false);
    }
  }

  function handleCatalogError(error: unknown) {
    if (needsConfiguration(error)) {
      setSettingsOpen(true);
      setConfigurationError(catalogErrorText(error, true));
    }
  }

  return {
    status: () => (statusResource.error ? undefined : statusResource.latest),
    settingsOpen,
    setSettingsOpen,
    configurationBusy,
    configurationError: () => configurationError() || errorMessage(statusResource.error),
    remember,
    setRemember,
    refreshStatus,
    saveToken,
    clearConfiguration,
    handleCatalogError,
  };
}

type CacheRequest = { readonly client: StorageClient };

function createCacheSubViewModel(getStorageClient: () => StorageClient | undefined) {
  const [cacheRequest, setCacheRequest] = createSignal<CacheRequest>();
  const [cacheLimitGb, setCacheLimitGb] = createSignal("");
  const [cacheMutationBusy, setCacheMutationBusy] = createSignal(false);
  const [cacheMutationError, setCacheMutationError] = createSignal("");
  const [cacheMessage, setCacheMessage] = createSignal("");

  const [cacheResource, cacheActions] = createResource(cacheRequest, async (request) => {
    try {
      const response = await request.client.getCacheSettings({}, { timeoutMs: 10_000 });
      if (!response.settings) throw new Error("cache settings missing");
      const gb = Number(response.settings.limitBytes) / 1024 ** 3;
      setCacheLimitGb(String(gb));
      return response.settings;
    } catch {
      throw new Error("Não foi possível carregar as configurações do cache.");
    }
  });

  function loadCacheSettings() {
    const client = getStorageClient();
    if (client) {
      setCacheMutationError("");
      setCacheMessage("");
      setCacheRequest({ client });
    }
  }

  async function saveCacheLimit() {
    const client = getStorageClient();
    if (!client || cacheResource.loading || cacheMutationBusy()) return;
    const gb = Number(cacheLimitGb());
    setCacheMessage("");
    if (!cacheLimitGb().trim() || !Number.isSafeInteger(Math.round(gb * 1024 ** 3)) || gb < 0) {
      setCacheMutationError("Informe um limite válido em GB.");
      return;
    }
    setCacheMutationBusy(true);
    setCacheMutationError("");
    try {
      const bytes = BigInt(Math.round(gb * 1024 ** 3));
      const response = await client.setCacheLimit({ limitBytes: bytes }, { timeoutMs: 30_000 });
      if (!response.settings) throw new Error("cache settings missing");
      cacheActions.mutate(response.settings);
      setCacheMessage("Limite de armazenamento salvo.");
    } catch (error) {
      setCacheMutationError(
        error instanceof ConnectError && error.rawMessage === "SOURCE_IN_USE"
          ? "Feche a reprodução antes de reduzir o limite. O valor anterior foi mantido para proteger os arquivos em uso."
          : error instanceof ConnectError && error.rawMessage === "SOURCE_INVALID"
            ? "O limite está fora do intervalo permitido pelo serviço."
            : "Não foi possível aplicar o limite de armazenamento. Tente novamente.",
      );
    } finally {
      setCacheMutationBusy(false);
    }
  }

  async function clearCache() {
    const client = getStorageClient();
    if (!client || cacheResource.loading || cacheMutationBusy()) return;
    setCacheMutationBusy(true);
    setCacheMutationError("");
    setCacheMessage("");
    try {
      const response = await client.clearCache({}, { timeoutMs: 30_000 });
      if (!response.settings) throw new Error("cache settings missing");
      cacheActions.mutate(response.settings);
      setCacheMessage("Cache limpo. Espaço liberado.");
    } catch {
      setCacheMutationError(
        "Não foi possível limpar o cache agora. Pare a reprodução e tente novamente.",
      );
    } finally {
      setCacheMutationBusy(false);
    }
  }

  return {
    cacheSettings: () => (cacheResource.error ? undefined : cacheResource.latest),
    cacheLimitGb,
    setCacheLimitGb: (value: string) => {
      setCacheMessage("");
      setCacheLimitGb(value);
    },
    cacheMessage,
    cacheBusy: () => cacheResource.loading || cacheMutationBusy(),
    cacheError: () => cacheMutationError() || errorMessage(cacheResource.error),
    loadCacheSettings,
    saveCacheLimit,
    clearCache,
  };
}

export function createSettingsViewModel(
  getCatalogClient: () => CatalogClient | undefined,
  getStorageClient: () => StorageClient | undefined,
  getSourceCatalogClient: () => SourceCatalogClient | undefined,
) {
  const tmdb = createTmdbSubViewModel(getCatalogClient);
  const cache = createCacheSubViewModel(getStorageClient);
  const sourceCatalog = createSourceCatalogViewModel(getSourceCatalogClient);
  return { ...tmdb, ...cache, sourceCatalog };
}

export type SettingsViewModel = ReturnType<typeof createSettingsViewModel>;
