// Let Safari's native HLS engine handle converted video without ManagedMediaSource.
import { diagnostic, errorDetails, mediaSnapshot } from "./media-diagnostics";
import { playbackDeferred } from "./playback-deferred";

export function nativeHlsUrl(mediaUrl: string, base: string): string {
  const url = new URL(mediaUrl, base);
  url.pathname = url.pathname.replace(/\/stream$/, "/hls.m3u8");
  return url.href;
}

export function attachNativeMedia(
  video: HTMLVideoElement,
  config: { readonly playbackId: string; readonly mediaUrl: string; readonly startSeconds: number },
  fail: (message: string) => void,
): () => void {
  let active = true;
  const context = { playbackId: config.playbackId };
  const failed = () => {
    diagnostic("media.native_failed", context, mediaSnapshot(video));
    fail("Não foi possível carregar ou decodificar este vídeo. Tente novamente.");
  };
  const ready = () => {
    if (config.startSeconds > 0) video.currentTime = config.startSeconds;
    void video.play().catch((error: unknown) => {
      diagnostic("media.play_rejected", context, errorDetails(error));
      if (active && !playbackDeferred(error)) fail("Não foi possível reproduzir este vídeo.");
    });
  };
  video.autoplay = false;
  video.addEventListener("error", failed);
  video.addEventListener("loadedmetadata", ready, { once: true });
  video.src = config.mediaUrl;
  video.load();
  return () => {
    active = false;
    video.removeEventListener("error", failed);
    video.removeEventListener("loadedmetadata", ready);
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
}
