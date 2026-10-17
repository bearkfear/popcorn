// WebKit's fullscreen flag can remain true while the presentation mode is already inline.
export function videoPresentation(video: {
  readonly webkitPresentationMode?: string;
  readonly webkitDisplayingFullscreen?: boolean;
}): "inline" | "fullscreen" | "picture-in-picture" {
  const mode = video.webkitPresentationMode;
  if (mode === "inline" || mode === "fullscreen" || mode === "picture-in-picture") return mode;
  return video.webkitDisplayingFullscreen ? "fullscreen" : "inline";
}
