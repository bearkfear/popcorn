// Exchanges a launch ticket for an HttpOnly session; credentials stay outside JavaScript storage.
import type { Bootstrap } from "../../shared/types";

export class PairingRequired extends Error {}

let ticket = "";
let developmentServer = "";
const developmentServerKey = "popcorn.development-server";

function loopbackAddress(value: string): string {
  const match = /^(localhost|127\.0\.0\.1):(\d{1,5})$/.exec(value);
  const port = Number(match?.[2]);
  return match && port > 0 && port <= 65_535 ? value : "";
}

export function isBrowserServer(): boolean {
  return (
    typeof document !== "undefined" &&
    (developmentServer !== "" || document.querySelector('meta[name="popcorn-server"]') !== null)
  );
}

export function captureBrowserTicket() {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  ticket = parameters.get("launch") ?? "";
  const developmentOrigin = window.location.origin === "http://localhost:1420";
  developmentServer = loopbackAddress(
    parameters.get("server") ??
      (developmentOrigin ? sessionStorage.getItem(developmentServerKey) : "") ??
      "",
  );
  if (developmentOrigin && parameters.has("server") && developmentServer) {
    sessionStorage.setItem(developmentServerKey, developmentServer);
  }
  if (ticket) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  } else if (window.location.hash === "#search") {
    window.history.replaceState(null, "", "/");
  } else if (window.location.hash === "#settings") {
    window.history.replaceState(null, "", "/settings");
  }
}

export async function browserBootstrap(signal: AbortSignal): Promise<Bootstrap> {
  const baseUrl = developmentServer ? `http://${developmentServer}` : "";
  if (ticket) {
    const response = await fetch(`${baseUrl}/browser/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
      credentials: "include",
      signal,
    });
    if (!response.ok) throw new Error("Abra o Popcorn pelo ícone do aplicativo para conectar.");
    ticket = "";
  }
  const response = await fetch(`${baseUrl}/health`, {
    signal,
    cache: "no-store",
    credentials: "include",
  });
  if (response.status === 401)
    throw new PairingRequired("Conecte este dispositivo com o código mostrado no computador.");
  if (!response.ok)
    throw new Error("Não foi possível conectar ao Popcorn. Verifique se o computador está ligado.");
  const health = (await response.json()) as { instance_id: string; catalog_version: string };
  return {
    address: developmentServer || window.location.host,
    token: "",
    protocolVersion: "bootstrap.v1",
    instanceId: health.instance_id,
    catalogVersion: health.catalog_version,
  };
}
