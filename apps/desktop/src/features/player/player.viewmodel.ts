import { PlaybackQuality, PlaybackState } from "@popcorn/sdk";
import { fromActorRef } from "@xstate/solid";
import { createSignal, onCleanup } from "solid-js";
import { createActor, waitFor } from "xstate";
import type { PlaybackClient } from "../../shared/types";
import { diagnostic } from "./media-diagnostics";
import { playbackSessionMachine } from "./playback-session.machine";

type PlaybackFile = { readonly sourceId: string; readonly fileIndex: number };
export function createPlayerViewModel(getClient: () => PlaybackClient | undefined) {
  const actor = createActor(playbackSessionMachine).start();
  const snapshot = fromActorRef(actor);
  const send = actor.send;
  const playback = () => snapshot().context.playback;
  const busy = () => snapshot().matches("starting") || snapshot().matches({ active: "mutating" });
  const error = () => snapshot().context.error;
  const monitorError = () => snapshot().context.monitorError;
  const [quality, setQuality] = createSignal(PlaybackQuality.AUTO);
  const [mediaError, setMediaError] = createSignal("");
  const [viewing, setViewing] = createSignal(false);
  const [initialPosition, setInitialPosition] = createSignal(0);
  const [audioStreamIndex, setAudioStreamIndex] = createSignal<number>();
  const [preparedFile, setPreparedFile] = createSignal<PlaybackFile>();
  let preparedQuality = quality();
  let lastFile: PlaybackFile | undefined;
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

  function close(stop = true) {
    send({ type: "CLOSE", stop });
    setMediaError("");
    setViewing(false);
    setPreparedFile(undefined);
  }

  async function playFile(sourceId: string, fileIndex: number, open = true, position = 0) {
    const client = getClient();
    if (!client || busy() || actor.getSnapshot().status === "stopped") return;
    close();
    lastFile = { sourceId, fileIndex };
    setPreparedFile(lastFile);
    setInitialPosition(position);
    setViewing(open);
    preparedQuality = quality();
    send({
      type: "START",
      request: {
        client,
        sourceId,
        fileIndex,
        quality: quality(),
        audioStreamIndex: audioStreamIndex(),
        position,
        open,
      },
    });
    await waitFor(actor, (state) => !state.matches("starting")).catch((cause: unknown) => {
      if (actor.getSnapshot().status !== "stopped") throw cause;
    });
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
    if (!playback() || busy() || actor.getSnapshot().status === "stopped") return;
    send({ type: "TOGGLE_DOWNLOAD" });
    await waitFor(actor, (state) => !state.matches({ active: "mutating" })).catch(
      (cause: unknown) => {
        if (actor.getSnapshot().status !== "stopped") throw cause;
      },
    );
  }

  onCleanup(() => {
    close();
    actor.stop();
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
