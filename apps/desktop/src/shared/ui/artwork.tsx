// Poster and backdrop artwork view component with fallback state.
import { createSignal, Show } from "solid-js";
import { artworkUrl } from "../../catalog-ui";
import { artworkStyles } from "./artwork.styles";

export function Artwork(props: {
  readonly url: string;
  readonly title: string;
  readonly wide?: boolean;
}) {
  const [failed, setFailed] = createSignal("");
  const styles = () => artworkStyles({ wide: props.wide ?? false });
  const safeUrl = () => artworkUrl(props.url);

  return (
    <div class={styles().root()}>
      <Show
        when={safeUrl() && failed() !== props.url}
        fallback={<span class={styles().empty()}>Sem imagem</span>}
      >
        <img
          class={styles().image()}
          src={safeUrl()}
          alt={props.title}
          loading="lazy"
          onError={() => setFailed(props.url)}
        />
      </Show>
    </div>
  );
}
