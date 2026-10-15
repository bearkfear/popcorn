// ViewModel handling TMDB credentials and storage cache settings.
import { createSignal } from "solid-js";
import type { CacheSettings, TmdbStatus } from "@popcorn/sdk";
import type { CatalogClient, StorageClient } from "../../shared/types";
import { catalogErrorText, needsConfiguration } from "../../catalog-ui";

function createTmdbSubViewModel(getCatalogClient: () => CatalogClient | undefined) {
  const [status, setStatus] = createSignal<TmdbStatus>();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [configurationBusy, setConfigurationBusy] = createSignal(false);
  const [configurationError, setConfigurationError] = createSignal("");
  const [remember, setRemember] = createSignal(true);

  async function refreshStatus() {
    const client = getCatalogClient();
    if (!client) return;
    try {
      const res = await client.getTmdbStatus({}, { timeoutMs: 10_000 });
      if (res.status) setStatus(res.status);
    } catch {}
  }

  async function saveToken(token: string) {
    const client = getCatalogClient();
    if (!client || configurationBusy()) return;
    setConfigurationBusy(true);
    setConfigurationError("");
    try {
      const res = await client.setTmdbToken({ token, save: remember() }, { timeoutMs: 15_000 });
      if (res.status) {
        setStatus(res.status);
        setSettingsOpen(false);
      }
    } catch (e) {
      setConfigurationError(catalogErrorText(e, true));
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
    status, setStatus, settingsOpen, setSettingsOpen,
    configurationBusy, configurationError, remember, setRemember,
    refreshStatus, saveToken, handleCatalogError,
  };
}

function createCacheSubViewModel(getStorageClient: () => StorageClient | undefined) {
  const [cacheOpen, setCacheOpen] = createSignal(false);
  const [cacheSettings, setCacheSettings] = createSignal<CacheSettings>();
  const [cacheLimitGb, setCacheLimitGb] = createSignal("20");
  const [cacheBusy, setCacheBusy] = createSignal(false);
  const [cacheError, setCacheError] = createSignal("");

  async function loadCacheSettings() {
    const client = getStorageClient();
    if (!client) return;
    setCacheBusy(true);
    setCacheError("");
    try {
      const res = await client.getCacheSettings({}, { timeoutMs: 10_000 });
      if (res.settings) {
        setCacheSettings(res.settings);
        const gb = Number(res.settings.limitBytes / (1024n * 1024n * 1024n));
        setCacheLimitGb(String(gb || 20));
      }
    } catch {
      setCacheError("Não foi possível carregar as configurações do cache.");
    } finally {
      setCacheBusy(false);
    }
  }

  async function saveCacheLimit() {
    const client = getStorageClient();
    const gb = Number.parseInt(cacheLimitGb(), 10);
    if (!client || Number.isNaN(gb) || gb < 1 || gb > 1000) {
      setCacheError("Defina um limite de cache entre 1 e 1000 GB.");
      return;
    }
    setCacheBusy(true);
    setCacheError("");
    try {
      const bytes = BigInt(gb) * 1024n * 1024n * 1024n;
      const res = await client.setCacheLimit({ limitBytes: bytes }, { timeoutMs: 10_000 });
      if (res.settings) setCacheSettings(res.settings);
    } catch {
      setCacheError("Não foi possível salvar o limite de cache.");
    } finally {
      setCacheBusy(false);
    }
  }

  async function clearCache() {
    const client = getStorageClient();
    if (!client || cacheBusy()) return;
    setCacheBusy(true);
    setCacheError("");
    try {
      const res = await client.clearCache({}, { timeoutMs: 30_000 });
      if (res.settings) setCacheSettings(res.settings);
    } catch {
      setCacheError("Não foi possível limpar o cache agora. Pare a reprodução e tente novamente.");
    } finally {
      setCacheBusy(false);
    }
  }

  return {
    cacheOpen, setCacheOpen, cacheSettings, cacheLimitGb, setCacheLimitGb,
    cacheBusy, cacheError, loadCacheSettings, saveCacheLimit, clearCache,
  };
}

export function createSettingsViewModel(
  getCatalogClient: () => CatalogClient | undefined,
  getStorageClient: () => StorageClient | undefined
) {
  const tmdb = createTmdbSubViewModel(getCatalogClient);
  const cache = createCacheSubViewModel(getStorageClient);
  return { ...tmdb, ...cache };
}

export type SettingsViewModel = ReturnType<typeof createSettingsViewModel>;
