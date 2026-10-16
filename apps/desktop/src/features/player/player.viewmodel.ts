import { type Playback, PlaybackQuality, PlaybackState } from "@popcorn/sdk";
import { createResource, createSignal, onCleanup } from "solid-js";
import type { PlaybackClient } from "../../shared/types";

type PlaybackFile = { readonly sourceId: string; readonly fileIndex: number };
type PlaybackRequest = { readonly client: PlaybackClient; readonly playbackId: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function createPlayerViewModel(getClient: () => PlaybackClient | undefined) {
  const [playbackRequest, setPlaybackRequest] = createSignal<PlaybackRequest>();
  const [quality, setQuality] = createSignal(PlaybackQuality.AUTO);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [mediaError, setMediaError] = createSignal("");
  let lastFile: PlaybackFile | undefined;
  let controller: AbortController | undefined;
  let poll: number | undefined;
  let generation = 0;
  let disposed = false;

  const [playbackResource, playbackActions] = createResource(playbackRequest, async (request) => {
    try {
      const response = await request.client.getPlayback(
        { playbackId: request.playbackId },
        { timeoutMs: 5_000 },
      );
      if (!response.playback) throw new Error("playback missing");
      return response.playback;
    } catch {
      throw new Error(
        "Não foi possível atualizar o estado da reprodução. Tentando reconectar ao serviço.",
      );
    }
  });
  const playback = () => playbackResource.latest;

  const progress = () => {
    const current = playback();
    if (!current || current.totalBytes <= 0n) return 0;
    return Math.min(100, Number((current.downloadedBytes * 10_000n) / current.totalBytes) / 100);
  };
  const mediaReady = () => {
    const current = playback();
    return Boolean(
      current?.mediaUrl &&
        (current.state === PlaybackState.READY || current.state === PlaybackState.PAUSED),
    );
  };
  const preparationError = () =>
    playback()?.state === PlaybackState.FAILED
      ? playback()?.error || "Não foi possível preparar este vídeo. Tente novamente."
      : "";
  const displayError = () => preparationError() || mediaError() || error();
  const monitorError = () => errorMessage(playbackResource.error);
  const conversionLabel = () => {
    switch (playback()?.conversion) {
      case "direct":
        return "Reprodução direta";
      case "remux":
        return "Conversão de contêiner · vídeo e áudio originais";
      case "audio":
        return "Conversão de áudio · vídeo original";
      case "transcode":
        return "Conversão de vídeo";
      default:
        return "Analisando o formato do vídeo";
    }
  };

  function stopPolling() {
    if (poll !== undefined) window.clearInterval(poll);
    poll = undefined;
  }

  function close(stop = true) {
    const current = playback();
    generation++;
    controller?.abort();
    controller = undefined;
    stopPolling();
    setPlaybackRequest(undefined);
    playbackActions.mutate(undefined);
    setBusy(false);
    setError("");
    setMediaError("");
    const client = getClient();
    if (stop && current && client) {
      void client.stopPlayback({ playbackId: current.playbackId }).catch(() => undefined);
    }
  }

  function monitor(client: PlaybackClient, current: Playback) {
    stopPolling();
    playbackActions.mutate(current);
    setPlaybackRequest({ client, playbackId: current.playbackId });
    poll = window.setInterval(() => {
      void playbackActions.refetch();
    }, 1_000);
  }

  async function playFile(sourceId: string, fileIndex: number) {
    const client = getClient();
    if (!client || busy()) return;
    close();
    const currentGeneration = generation;
    controller = new AbortController();
    lastFile = { sourceId, fileIndex };
    setBusy(true);
    try {
      const response = await client.startPlayback(
        { sourceId, fileIndex, quality: quality(), idempotencyKey: crypto.randomUUID() },
        { signal: controller.signal, timeoutMs: 60_000 },
      );
      if (!response.playback) throw new Error("playback missing");
      if (!disposed && generation === currentGeneration) monitor(client, response.playback);
    } catch {
      if (!disposed && generation === currentGeneration) {
        setError("Não foi possível preparar o vídeo. A fonte pode estar indisponível.");
      }
    } finally {
      if (!disposed && generation === currentGeneration) setBusy(false);
    }
  }

  async function retry() {
    if (lastFile) await playFile(lastFile.sourceId, lastFile.fileIndex);
  }

  async function toggleDownload() {
    const client = getClient();
    const current = playback();
    if (!client || !current || busy()) return;
    setBusy(true);
    setError("");
    try {
      const response =
        current.state === PlaybackState.PAUSED
          ? await client.resumePlayback({ playbackId: current.playbackId }, { timeoutMs: 10_000 })
          : await client.pausePlayback({ playbackId: current.playbackId }, { timeoutMs: 10_000 });
      if (!response.playback) throw new Error("playback missing");
      if (!disposed && playback()?.playbackId === current.playbackId) {
        playbackActions.mutate(response.playback);
      }
    } catch {
      if (!disposed && playback()?.playbackId === current.playbackId) {
        setError("Não foi possível alterar o estado do download.");
      }
    } finally {
      if (!disposed && playback()?.playbackId === current.playbackId) setBusy(false);
    }
  }

  onCleanup(() => {
    disposed = true;
    close();
  });

  return {
    playback,
    quality,
    setQuality,
    busy,
    error,
    mediaError,
    setMediaError,
    monitorError,
    progress,
    mediaReady,
    preparationError,
    displayError,
    conversionLabel,
    playFile,
    retry,
    toggleDownload,
    close,
  };
}

export type PlayerViewModel = ReturnType<typeof createPlayerViewModel>;
