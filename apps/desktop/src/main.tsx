import { render } from "solid-js/web";
import { App } from "./App";
import { captureBrowserTicket } from "./features/bootstrap/browser-session";
import { PlayerWindow } from "./features/player/player-window";
import "./styles.css";

captureBrowserTicket();

const root = document.getElementById("root");
if (root) {
  render(
    () =>
      window.location.hash === "#video" || window.location.hash.startsWith("#video=") ? (
        <PlayerWindow />
      ) : (
        <App />
      ),
    root,
  );
}
