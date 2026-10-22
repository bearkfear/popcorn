import { expect, test } from "bun:test";
import { attachNativeMedia, nativeHlsUrl } from "../src/features/player/native-media";

class Video extends EventTarget {
  src = "";
  autoplay = true;
  currentTime = 0;
  plays = 0;
  pauses = 0;
  loads = 0;
  load() {
    this.loads++;
  }
  play() {
    this.plays++;
    return Promise.resolve();
  }
  pause() {
    this.pauses++;
  }
  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }
}

test("native HLS preserves the LAN origin and playback credential", () => {
  expect(nativeHlsUrl("/media/id/stream?token=test", "http://192.168.1.10:8080/#video=id")).toBe(
    "http://192.168.1.10:8080/media/id/hls.m3u8?token=test",
  );
  expect(
    nativeHlsUrl("http://127.0.0.1:8080/media/id/stream?token=test", "http://localhost:1420/"),
  ).toBe("http://127.0.0.1:8080/media/id/hls.m3u8?token=test");
});

test("native playback restores metadata once and releases listeners when replaced", () => {
  const video = new Video();
  const errors: string[] = [];
  const release = attachNativeMedia(
    video as unknown as HTMLVideoElement,
    { playbackId: "id", mediaUrl: "/media/id/hls.m3u8?token=test", startSeconds: 73.5 },
    (message) => errors.push(message),
  );
  expect(video.loads).toBe(1);
  expect(video.autoplay).toBe(false);
  expect(video.plays).toBe(0);
  video.dispatchEvent(new Event("loadedmetadata"));
  expect(video.currentTime).toBe(73.5);
  expect(video.plays).toBe(1);
  // Further metadata changes must not rewind after a user seeks.
  video.currentTime = 120;
  video.dispatchEvent(new Event("loadedmetadata"));
  expect(video.currentTime).toBe(120);
  release();
  expect(video.src).toBe("");
  expect(video.pauses).toBe(1);
  expect(video.loads).toBe(2);
  video.dispatchEvent(new Event("loadedmetadata"));
  video.dispatchEvent(new Event("error"));
  expect(video.plays).toBe(1);
  expect(errors).toEqual([]);
});
