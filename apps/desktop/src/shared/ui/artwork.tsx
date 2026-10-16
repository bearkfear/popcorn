// Poster and backdrop artwork view component with fallback state.
import { createSignal, Show } from "solid-js";
import { artworkUrl } from "../../catalog-ui";

export function Artwork(props: {
  readonly url: string;
  readonly title: string;
  readonly wide?: boolean;
}) {
  const [failed, setFailed] = createSignal("");
  const safeUrl = () => artworkUrl(props.url);

  return (
    <div class={`artwork ${props.wide ? "artwork-wide" : ""}`}>
      <Show
        when={safeUrl() && failed() !== props.url}
        fallback={<span class="artwork-empty">Sem imagem</span>}
      >
        <img
          src={safeUrl()}
          alt={props.title}
          loading="lazy"
          onError={() => setFailed(props.url)}
        />
      </Show>
    </div>
  );
}
