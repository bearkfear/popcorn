import { render } from "solid-js/web";
import { App } from "./App";
import { PlayerWindow } from "./features/player/player-window";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  render(() => (window.location.hash === "#video" ? <PlayerWindow /> : <App />), root);
}
