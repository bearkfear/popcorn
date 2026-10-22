import { describe, expect, test } from "bun:test";
import {
  supportsPictureInPicture,
  toggleVideoFullscreen,
  usesCanvasVideo,
  videoPresentation,
} from "../src/features/player/video-presentation";

describe("WebKit video surface", () => {
  test("uses canvas for iPhone frames and preserves desktop browser rendering", () => {
    expect(
      usesCanvasVideo(false, "iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Safari/604.1"),
    ).toBe(true);
    expect(usesCanvasVideo(true, "MacIntel", "Safari")).toBe(true);
    expect(usesCanvasVideo(false, "MacIntel", "Safari")).toBe(false);
    expect(usesCanvasVideo(false, "Linux", "Silk/123.0")).toBe(false);
  });

  test("iPhone enters and exits native video fullscreen when the element API is unavailable", async () => {
    const calls: string[] = [];
    const video = {
      webkitDisplayingFullscreen: false,
      webkitEnterFullscreen: () => {
        calls.push("enter");
        video.webkitDisplayingFullscreen = true;
      },
      webkitExitFullscreen: () => {
        calls.push("exit");
        video.webkitDisplayingFullscreen = false;
      },
    };
    const doc = {
      fullscreenEnabled: false,
      exitFullscreen: async () => {
        calls.push("document-exit");
      },
    };
    const surface = {
      requestFullscreen: async () => {
        calls.push("element-enter");
      },
    };
    await toggleVideoFullscreen(video, surface, doc, true);
    await toggleVideoFullscreen(video, surface, doc, true);
    expect(calls).toEqual(["enter", "exit"]);
    await toggleVideoFullscreen(video, surface, doc, false);
    expect(calls.at(-1)).toBe("enter");
  });

  test("desktop browsers enter and exit the fullscreen container", async () => {
    const calls: string[] = [];
    const doc = {
      fullscreenElement: null as object | null,
      fullscreenEnabled: true,
      exitFullscreen: async () => {
        calls.push("exit");
      },
    };
    const surface = {
      requestFullscreen: async () => {
        calls.push("enter");
      },
    };
    await toggleVideoFullscreen({}, surface, doc, false);
    doc.fullscreenElement = surface;
    await toggleVideoFullscreen({}, surface, doc, false);
    expect(calls).toEqual(["enter", "exit"]);
  });
});

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

describe("picture-in-picture availability", () => {
  test("an exposed but disabled API and TV presentation do not offer PiP", () => {
    const video = { requestPictureInPicture: () => Promise.resolve() };
    expect(supportsPictureInPicture(video, { pictureInPictureEnabled: false }, false)).toBe(false);
    expect(supportsPictureInPicture(video, { pictureInPictureEnabled: true }, true)).toBe(false);
    expect(
      supportsPictureInPicture(
        { ...video, disablePictureInPicture: true },
        { pictureInPictureEnabled: true },
        false,
      ),
    ).toBe(false);
    expect(supportsPictureInPicture(video, { pictureInPictureEnabled: true }, false)).toBe(true);
  });

  test("WebKit requires an explicitly supported PiP mode and its setter", () => {
    const video = {
      webkitSupportsPresentationMode: (mode: string) => mode === "picture-in-picture",
    };
    expect(supportsPictureInPicture(video, {}, false)).toBe(false);
    expect(
      supportsPictureInPicture({ ...video, webkitSetPresentationMode: () => {} }, {}, false),
    ).toBe(true);
  });
});
