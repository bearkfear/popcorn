// Hidrata no navegador a aplicação renderizada pelo SolidStart.
import { mount, StartClient } from "@solidjs/start/client";

const root = document.getElementById("app");
if (!root) throw new Error("O elemento raiz do Popcorn não foi encontrado.");

mount(() => <StartClient />, root);
