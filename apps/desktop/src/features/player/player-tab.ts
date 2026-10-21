// Hands a playback intent to a new same-origin tab without changing catalog navigation.
import type { WatchEntry } from "../history/history.model";

export type WindowSession = {
  context: Omit<WatchEntry, "key" | "status" | "position" | "duration" | "updatedAt">;
  position: number;
};

const key = "popcorn-player-session";

export function openPlayerTab(session: WindowSession): Window | null {
  const previous = sessionStorage.getItem(key);
  sessionStorage.setItem(key, JSON.stringify(session));
  try {
    // A new tab inherits a copy of sessionStorage before the parent clears its handoff.
    return window.open(`${window.location.pathname}#video`, "_blank");
  } finally {
    if (previous === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, previous);
  }
}

export function readPlayerSession(): WindowSession {
  const value = sessionStorage.getItem(key);
  if (!value) throw new Error("Abra o vídeo pela aba do catálogo.");
  return JSON.parse(value) as WindowSession;
}

export function savePlayerSession(session: WindowSession) {
  try {
    sessionStorage.setItem(key, JSON.stringify(session));
  } catch {
    // The backend still receives progress if tab-local storage becomes unavailable.
  }
}
