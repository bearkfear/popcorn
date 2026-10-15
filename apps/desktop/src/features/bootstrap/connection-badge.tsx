// View displaying live backend connection status and diagnostic errors.
import { Show } from "solid-js";
import type { Connection } from "../../shared/types";

export function ConnectionBadge(props: {
  readonly connection: Connection;
  readonly onRetry: () => void;
  readonly isBusy: boolean;
}) {
  const label = () => {
    switch (props.connection) {
      case "connecting": return "Conectando";
      case "ready": return "Conectado";
      case "error": return "Serviço indisponível";
      case "browser": return "Modo navegador";
    }
  };

  return (
    <div class="connection-panel cluster">
      <div>
        <span class={`status status-${props.connection}`}>{label()}</span>
        <p class="connection-caption muted">
          {props.connection === "browser"
            ? "Abra no aplicativo desktop para reproduzir mídias."
            : "Serviço local de descoberta e catálogo."}
        </p>
      </div>
      <Show when={props.connection === "error"}>
        <button
          class="button secondary"
          type="button"
          disabled={props.isBusy}
          onClick={props.onRetry}
        >
          Reconectar
        </button>
      </Show>
    </div>
  );
}
