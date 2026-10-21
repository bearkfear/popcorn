// Connects a TV or another browser to the server using the code shown on the PC.
import { createSignal } from "solid-js";
import { buttonStyles } from "../../shared/ui/styles";

export function PairingPanel(props: { readonly onConnected: () => void }) {
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  async function connect(event: SubmitEvent) {
    event.preventDefault();
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/browser/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code().trim() }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Aguarde um minuto antes de tentar novamente."
            : response.status === 410
              ? "O código expirou. Abra novamente Acessar pela TV no computador."
              : "Código incorreto. Confira o código mostrado no computador.",
        );
      }
      props.onConnected();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível conectar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main class="grid min-h-dvh place-items-center bg-canvas-deep px-6 py-12">
      <form
        class="w-full max-w-md rounded-panel border border-line bg-slate-2 p-8"
        onSubmit={(event) => void connect(event)}
      >
        <p class="mb-3 text-sm font-bold text-accent-strong">popcorn.</p>
        <h1 class="text-2xl font-medium">Conecte ao seu Popcorn</h1>
        <p class="mt-4 text-sm leading-relaxed text-muted">
          No computador, clique no ícone do Popcorn na barra de menus ou na bandeja e escolha
          Acessar pela TV.
        </p>
        <label class="mb-2 mt-6 block text-sm" for="pairing-code">
          Código de conexão
        </label>
        <input
          id="pairing-code"
          class="min-h-14 w-full rounded-control border border-line bg-canvas-deep px-4 text-center text-2xl tracking-[0.3em]"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          required
          value={code()}
          onInput={(event) => setCode(event.currentTarget.value.replace(/[^0-9]/g, ""))}
          disabled={busy()}
        />
        <p class="mt-4 text-sm text-negative" role="alert">
          {error()}
        </p>
        <button class={buttonStyles({ class: "mt-5 w-full" })} type="submit" disabled={busy()}>
          {busy() ? "Conectando…" : "Conectar"}
        </button>
      </form>
    </main>
  );
}
