export type VideoPresentation = "inline" | "fullscreen" | "picture-in-picture";

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
