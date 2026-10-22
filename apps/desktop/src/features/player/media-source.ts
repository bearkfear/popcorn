export type PlaybackMediaSource = MediaSource & { readonly streaming?: boolean };

type SourceConstructor = {
  new (): PlaybackMediaSource;
  isTypeSupported(type: string): boolean;
};

type SourceEnvironment = {
  readonly MediaSource?: SourceConstructor;
  readonly ManagedMediaSource?: SourceConstructor;
};

export function playbackMediaSource(type: string, environment: SourceEnvironment = globalThis) {
  if (environment.MediaSource?.isTypeSupported(type)) {
    return { constructor: environment.MediaSource, kind: "standard" } as const;
  }
  if (environment.ManagedMediaSource?.isTypeSupported(type)) {
    return { constructor: environment.ManagedMediaSource, kind: "managed" } as const;
  }
  return undefined;
}

export function waitForStreaming(source: PlaybackMediaSource, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const clean = () => {
      source.removeEventListener("startstreaming", check);
      signal.removeEventListener("abort", cancelled);
    };
    const check = () => {
      if (source.streaming !== false) {
        clean();
        resolve();
      }
    };
    const cancelled = () => {
      clean();
      reject(signal.reason);
    };
    source.addEventListener("startstreaming", check);
    signal.addEventListener("abort", cancelled, { once: true });
    if (signal.aborted) cancelled();
    else check();
  });
}
