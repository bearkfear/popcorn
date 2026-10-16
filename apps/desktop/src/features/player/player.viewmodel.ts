import { type Playback, PlaybackQuality, PlaybackState } from "@popcorn/sdk";
import { createResource, createSignal, onCleanup } from "solid-js";
import { resourceValue } from "../../shared/resource-value";
import type { PlaybackClient } from "../../shared/types";
import { diagnostic, errorDetails } from "./media-diagnostics";

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
  const [viewing, setViewing] = createSignal(false);
  const [initialPosition, setInitialPosition] = createSignal(0);
  const [audioStreamIndex, setAudioStreamIndex] = createSignal<number>();
  const [preparedFile, setPreparedFile] = createSignal<PlaybackFile>();
  let preparedQuality = quality();
  let lastFile: PlaybackFile | undefined;
  let controller: AbortController | undefined;
  let poll: number | undefined;
  let generation = 0;
  let disposed = false;
  let lastState = "";

  const [playbackResource, playbackActions] = createResource(playbackRequest, async (request) => {
    try {
      const response = await request.client.getPlayback(
        { playbackId: request.playbackId },
        { timeoutMs: 5_000 },
      );
      if (!response.playback) throw new Error("playback missing");
      const current = response.playback;
      const state = `${current.playbackId}:${current.state}:${current.conversion}:${current.error}`;
      if (state !== lastState) {
        lastState = state;
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
      }
      return response.playback;
    } catch (error) {
      diagnostic("playback.poll_failed", { playbackId: request.playbackId }, errorDetails(error));
      throw new Error(
        "Não foi possível atualizar o estado da reprodução. Tentando reconectar ao serviço.",
      );
    }
  });
  const playback = resourceValue(playbackResource);

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
    if (current) diagnostic("playback.closed", { playbackId: current.playbackId }, { stop });
    generation++;
    controller?.abort();
    controller = undefined;
    stopPolling();
    setPlaybackRequest(undefined);
    playbackActions.mutate(undefined);
    setBusy(false);
    setError("");
    setMediaError("");
    setViewing(false);
    setPreparedFile(undefined);
    const client = getClient();
    if (stop && current && client) {
      void client.stopPlayback({ playbackId: current.playbackId }).catch((error: unknown) => {
        diagnostic("playback.stop_failed", { playbackId: current.playbackId }, errorDetails(error));
      });
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

  async function playFile(sourceId: string, fileIndex: number, open = true, position = 0) {
    const client = getClient();
    if (!client || busy()) return;
    close();
    const currentGeneration = generation;
    controller = new AbortController();
    lastFile = { sourceId, fileIndex };
    setPreparedFile(lastFile);
    setInitialPosition(position);
    setViewing(open);
    preparedQuality = quality();
    setBusy(true);
    const started = performance.now();
    const attemptId = crypto.randomUUID();
    diagnostic(
      "playback.start_requested",
      {},
      {
        attempt_id: attemptId,
        source_id: sourceId,
        file_index: fileIndex,
        quality: quality(),
        audio_stream_index: audioStreamIndex(),
        start_seconds: position,
        open_player: open,
      },
    );
    try {
      const response = await client.startPlayback(
        {
          sourceId,
          fileIndex,
          quality: quality(),
          idempotencyKey: attemptId,
          ...(audioStreamIndex() !== undefined ? { audioStreamIndex: audioStreamIndex() } : {}),
        },
        { signal: controller.signal, timeoutMs: 60_000 },
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
      if (!disposed && generation === currentGeneration) monitor(client, response.playback);
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
      if (!disposed && generation === currentGeneration) {
        setError("Não foi possível preparar o vídeo. A fonte pode estar indisponível.");
      }
    } finally {
      if (!disposed && generation === currentGeneration) setBusy(false);
    }
  }

  async function retry() {
    diagnostic(
      "playback.retry_requested",
      {},
      { source_id: lastFile?.sourceId, file_index: lastFile?.fileIndex },
    );
    if (lastFile)
      await playFile(lastFile.sourceId, lastFile.fileIndex, viewing(), initialPosition());
  }

  async function prepareFile(sourceId: string, fileIndex: number) {
    setAudioStreamIndex(undefined);
    await playFile(sourceId, fileIndex, false);
  }

  async function changeAudio(index: number, position: number) {
    const current = playback();
    if (busy() || !lastFile || !current?.audioTracks.some((track) => track.streamIndex === index))
      return;
    if (current.audioStreamIndex === index) return;
    setAudioStreamIndex(index);
    await playFile(lastFile.sourceId, lastFile.fileIndex, true, position);
  }

  async function launch(position = 0) {
    if (!lastFile || !mediaReady()) return;
    diagnostic(
      "playback.launch_requested",
      { playbackId: playback()?.playbackId },
      {
        position,
        quality: quality(),
        audio_stream_index: audioStreamIndex(),
      },
    );
    const selectedAudio = audioStreamIndex();
    if (
      preparedQuality !== quality() ||
      (selectedAudio !== undefined && selectedAudio !== playback()?.audioStreamIndex)
    ) {
      await playFile(lastFile.sourceId, lastFile.fileIndex, true, position);
    } else {
      setInitialPosition(position);
      setViewing(true);
    }
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
    viewing,
    initialPosition,
    preparedFile,
    audioStreamIndex,
    setAudioStreamIndex,
    changeAudio,
    prepareFile,
    launch,
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
