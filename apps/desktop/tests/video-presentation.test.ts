import { describe, expect, test } from "bun:test";
import { videoPresentation } from "../src/features/player/video-presentation";

describe("native video presentation", () => {
  test("returning to the window wins over WebKit's stale fullscreen flag", () => {
    const video = { webkitPresentationMode: "inline", webkitDisplayingFullscreen: false };
    for (let cycle = 0; cycle < 5; cycle++) {
      expect(videoPresentation(video)).toBe("inline");
      video.webkitPresentationMode = "fullscreen";
      expect(videoPresentation(video)).toBe("fullscreen");
      video.webkitDisplayingFullscreen = true;
      video.webkitPresentationMode = "inline";
      expect(videoPresentation(video)).toBe("inline");
      video.webkitDisplayingFullscreen = false;
    }
  });

  test("PiP takes precedence over the fullscreen flag too", () => {
    expect(
      videoPresentation({
        webkitPresentationMode: "picture-in-picture",
        webkitDisplayingFullscreen: true,
      }),
    ).toBe("picture-in-picture");
  });

  test("uses the fullscreen flag when the presentation mode is unavailable", () => {
    expect(videoPresentation({ webkitDisplayingFullscreen: true })).toBe("fullscreen");
    expect(videoPresentation({ webkitDisplayingFullscreen: false })).toBe("inline");
    expect(videoPresentation({})).toBe("inline");
  });

  test("reads standard fullscreen and picture-in-picture state used by WebView2", () => {
    const video = {};
    expect(videoPresentation(video, { fullscreenElement: {} })).toBe("fullscreen");
    expect(videoPresentation(video, { pictureInPictureElement: video })).toBe("picture-in-picture");
    expect(videoPresentation(video, {})).toBe("inline");
  });
});
