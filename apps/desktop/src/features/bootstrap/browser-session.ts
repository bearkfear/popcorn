// Exchanges a launch ticket for an HttpOnly session; credentials stay outside JavaScript storage.
import type { Bootstrap } from "../../shared/types";

export class PairingRequired extends Error {}

let ticket = "";

export function isBrowserServer(): boolean {
  return (
    typeof document !== "undefined" &&
    document.querySelector('meta[name="popcorn-server"]') !== null
  );
}

export function captureBrowserTicket() {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  ticket = parameters.get("launch") ?? "";
  if (ticket) window.history.replaceState(null, "", window.location.pathname);
}

export async function browserBootstrap(signal: AbortSignal): Promise<Bootstrap> {
  if (ticket) {
    const response = await fetch("/browser/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
      signal,
    });
    if (!response.ok) throw new Error("Abra o Popcorn pelo ícone do aplicativo para conectar.");
    ticket = "";
  }
  const response = await fetch("/health", { signal, cache: "no-store" });
  if (response.status === 401)
    throw new PairingRequired("Conecte este dispositivo com o código mostrado no computador.");
  if (!response.ok)
    throw new Error("Não foi possível conectar ao Popcorn. Verifique se o computador está ligado.");
  const health = (await response.json()) as { instance_id: string; catalog_version: string };
  return {
    address: window.location.host,
    token: "",
    protocolVersion: "bootstrap.v1",
    instanceId: health.instance_id,
    catalogVersion: health.catalog_version,
  };
}
