import { describe, expect, mock, test } from "bun:test";
import { createActor, waitFor } from "xstate";
import {
  type BootstrapServices,
  bootstrapMachine,
} from "../src/features/bootstrap/bootstrap.machine";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const flush = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
const result = (catalogVersion: string) => ({ clients: {}, catalogVersion });
const services = (overrides: Partial<BootstrapServices> = {}): BootstrapServices => ({
  isDesktop: () => true,
  bootstrap: async () => result("current"),
  listenForShutdown: async () => () => {},
  ...overrides,
});

describe("bootstrap lifecycle", () => {
  test("reconnection aborts and ignores a previous attempt without replacing the listener", async () => {
    const first = deferred<ReturnType<typeof result>>();
    const second = deferred<ReturnType<typeof result>>();
    let firstSignal: AbortSignal | undefined;
    let calls = 0;
    const listen = mock(async () => () => {});
    const actor = createActor(bootstrapMachine, {
      input: services({
        listenForShutdown: listen,
        bootstrap: (signal) => {
          if (++calls === 1) {
            firstSignal = signal;
            return first.promise;
          }
          return second.promise;
        },
      }),
    }).start();
    try {
      actor.send({ type: "CONNECT" });
      actor.send({ type: "CONNECT" });
      expect(firstSignal?.aborted).toBe(true);
      second.resolve(result("second"));
      await waitFor(actor, (state) => state.matches("ready"));
      first.resolve(result("obsolete"));
      await flush();
      expect(actor.getSnapshot().context.catalogVersion).toBe("second");
      expect(listen).toHaveBeenCalledTimes(1);
    } finally {
      actor.stop();
    }
  });

  test("a shutdown error interrupts bootstrap and cannot be overwritten by its late result", async () => {
    const pending = deferred<ReturnType<typeof result>>();
    let report: (message: string) => void = () => {};
    const release = mock(() => {});
    const actor = createActor(bootstrapMachine, {
      input: services({
        bootstrap: () => pending.promise,
        listenForShutdown: async (onError) => {
          report = onError;
          return release;
        },
      }),
    }).start();
    actor.send({ type: "CONNECT" });
    report("backend stopped");
    pending.resolve(result("obsolete"));
    await flush();
    expect(actor.getSnapshot().matches("error")).toBe(true);
    expect(actor.getSnapshot().context.error).toBe("backend stopped");
    actor.stop();
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("a listener registered after disposal is released immediately", async () => {
    const registration = deferred<() => void>();
    const release = mock(() => {});
    const actor = createActor(bootstrapMachine, {
      input: services({ listenForShutdown: () => registration.promise }),
    }).start();
    actor.stop();
    registration.resolve(release);
    await flush();
    expect(release).toHaveBeenCalledTimes(1);
  });

  test("browser mode does not call native services", () => {
    const bootstrap = mock(async () => result("unused"));
    const listen = mock(async () => () => {});
    const actor = createActor(bootstrapMachine, {
      input: services({ isDesktop: () => false, bootstrap, listenForShutdown: listen }),
    }).start();
    try {
      actor.send({ type: "CONNECT" });
      expect(actor.getSnapshot().matches("browser")).toBe(true);
      expect(bootstrap).not.toHaveBeenCalled();
      expect(listen).not.toHaveBeenCalled();
    } finally {
      actor.stop();
    }
  });

  test("failed bootstrap can reconnect successfully", async () => {
    let fail = true;
    const actor = createActor(bootstrapMachine, {
      input: services({
        bootstrap: async () => {
          if (fail) throw new Error("startup failed");
          return result("recovered");
        },
      }),
    }).start();
    try {
      actor.send({ type: "CONNECT" });
      await waitFor(actor, (state) => state.matches("error"));
      expect(actor.getSnapshot().context.error).not.toBe("");
      fail = false;
      actor.send({ type: "CONNECT" });
      await waitFor(actor, (state) => state.matches("ready"));
      expect(actor.getSnapshot().context.error).toBe("");
      expect(actor.getSnapshot().context.catalogVersion).toBe("recovered");
    } finally {
      actor.stop();
    }
  });
});
