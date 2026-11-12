import { invoke } from "@tauri-apps/api/core";
import "./launcher.css";

const status = document.querySelector<HTMLElement>("#status");
const buttons = document.querySelectorAll<HTMLButtonElement>("[data-command]");

for (const button of buttons) {
  button.addEventListener("click", async () => {
    const command = button.dataset["command"];
    if (!command) return;

    button.disabled = true;
    if (status) status.textContent = command === "launcher_quit" ? "Encerrando…" : "Abrindo…";

    try {
      await invoke(command);
      if (status && command !== "launcher_quit") status.textContent = "";
    } catch (error) {
      if (status) status.textContent = String(error);
    } finally {
      if (command !== "launcher_quit") button.disabled = false;
    }
  });
}
