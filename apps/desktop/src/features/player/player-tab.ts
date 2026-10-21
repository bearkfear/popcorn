// Transfers playback intents through the server so isolated browser tabs can open them.
import { randomId } from "../../shared/random-id";
import type { WatchEntry } from "../history/history.model";

export type WindowSession = {
  context: Omit<WatchEntry, "key" | "status" | "position" | "duration" | "updatedAt">;
  position: number;
};

export function useInlinePlayer(): boolean {
  return /\bSilk\/|\bAFT[A-Z0-9]+\b/i.test(navigator.userAgent);
}

function sessionId(): string {
  const id = new URLSearchParams(window.location.hash.slice(1)).get("video");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Abra o vídeo pela aba do catálogo.");
  return id;
}

export async function openPlayerTab(session: WindowSession): Promise<Window | null> {
  const id = randomId();
  // Start the transfer and open the tab synchronously within the user's click.
  const pending = fetch(`/browser/player/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  const tab = window.open(`${window.location.pathname}#video=${id}`, "_blank");
  try {
    const response = await pending;
    if (!response.ok)
      throw new Error("Não foi possível preparar a aba do player. Tente novamente.");
    return tab;
  } catch (cause) {
    tab?.close();
    throw cause;
  }
}

export async function readPlayerSession(signal: AbortSignal): Promise<WindowSession> {
  const id = sessionId();
  try {
    const stored = sessionStorage.getItem(`popcorn-player-session:${id}`);
    if (stored) return JSON.parse(stored) as WindowSession;
  } catch {
    /* The server also supports browsers without tab storage. */
  }
  // The new tab may load before the catalog's transfer has finished.
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`/browser/player/${id}`, { signal, cache: "no-store" });
    if (response.ok) {
      const session = (await response.json()) as WindowSession;
      savePlayerSession(session);
      return session;
    }
    if (response.status !== 404) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    signal.throwIfAborted();
  }
  throw new Error("Não foi possível recuperar o vídeo. Abra novamente pelo catálogo.");
}

export function savePlayerSession(session: WindowSession) {
  try {
    sessionStorage.setItem(`popcorn-player-session:${sessionId()}`, JSON.stringify(session));
  } catch {
    // The backend still receives watch progress if tab storage is unavailable.
  }
}
