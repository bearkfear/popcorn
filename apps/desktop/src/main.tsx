import { Route, Router } from "@solidjs/router";
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
        <Router root={App}>
          <Route path="/" component={() => null} />
          <Route path="/settings" component={() => null} />
          <Route path="/title/:media/:id" component={() => null} />
          <Route path="/player" component={() => null} />
          <Route path="/*all" component={() => null} />
        </Router>
      ),
    root,
  );
}
