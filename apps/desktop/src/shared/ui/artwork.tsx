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
    <div
      class={`artwork relative grid w-full aspect-[2_/_3] place-items-center overflow-hidden rounded-[4px] [background:linear-gradient(145deg,_var(--slate-5),_var(--slate-3))] text-muted [&_img]:w-full [&_img]:h-full [&_img]:object-cover ${props.wide ? "artwork-wide " : ""}`}
    >
      <Show
        when={safeUrl() && failed() !== props.url}
        fallback={
          <span class="artwork-empty p-3 text-muted text-[12px] font-bold tracking-[0.08em] text-center uppercase">
            Sem imagem
          </span>
        }
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
