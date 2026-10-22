export type VideoPresentation = "inline" | "fullscreen" | "picture-in-picture";

export function usesCanvasVideo(nativeDesktop: boolean, platform: string, userAgent: string) {
  return (nativeDesktop && /Mac/.test(platform)) || /iPhone|iPad|iPod/.test(userAgent);
}

export function toggleVideoFullscreen(
  video: {
    readonly webkitDisplayingFullscreen?: boolean;
    webkitEnterFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
  },
  surface: { requestFullscreen?: () => Promise<void> } | undefined,
  presentationDocument: {
    readonly fullscreenElement?: unknown;
    readonly fullscreenEnabled?: boolean;
    exitFullscreen: () => Promise<void>;
  },
  preferNative: boolean,
): void | Promise<void> {
  if (presentationDocument.fullscreenElement) return presentationDocument.exitFullscreen();
  if (video.webkitDisplayingFullscreen && video.webkitExitFullscreen) {
    return video.webkitExitFullscreen();
  }
  if (
    !preferNative &&
    presentationDocument.fullscreenEnabled !== false &&
    surface?.requestFullscreen
  )
    return surface.requestFullscreen();
  if (video.webkitEnterFullscreen) return video.webkitEnterFullscreen();
  if (presentationDocument.fullscreenEnabled !== false && surface?.requestFullscreen)
    return surface.requestFullscreen();
  throw new Error("Fullscreen API unavailable");
}

type PresentationDocument = {
  readonly fullscreenElement?: unknown;
  readonly pictureInPictureElement?: unknown;
};

// WebKit exposes presentation state on the video. Chromium/WebView2 exposes it on document.
export function videoPresentation(
  video: {
    readonly webkitPresentationMode?: string;
    readonly webkitDisplayingFullscreen?: boolean;
  },
  presentationDocument?: PresentationDocument,
): VideoPresentation {
  if (presentationDocument?.pictureInPictureElement === video) return "picture-in-picture";
  if (presentationDocument?.fullscreenElement) return "fullscreen";
  const mode = video.webkitPresentationMode;
  if (mode === "inline" || mode === "fullscreen" || mode === "picture-in-picture") return mode;
  return video.webkitDisplayingFullscreen ? "fullscreen" : "inline";
}

// PiP is offered only when the browser exposes an enabled presentation API.
export function supportsPictureInPicture(
  video:
    | {
        readonly disablePictureInPicture?: boolean;
        readonly requestPictureInPicture?: () => unknown;
        readonly webkitSupportsPresentationMode?: (mode: string) => boolean;
        readonly webkitSetPresentationMode?: (mode: string) => void;
      }
    | undefined,
  presentationDocument: { readonly pictureInPictureEnabled?: boolean },
  television: boolean,
): boolean {
  if (!video || television || video.disablePictureInPicture) return false;
  if (
    presentationDocument.pictureInPictureEnabled &&
    typeof video.requestPictureInPicture === "function"
  )
    return true;
  return (
    typeof video.webkitSetPresentationMode === "function" &&
    video.webkitSupportsPresentationMode?.("picture-in-picture") === true
  );
}
