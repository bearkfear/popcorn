import { CatalogCategory, MediaType, type Title } from "@popcorn/sdk";
import { createSignal, Show } from "solid-js";
import { artworkUrl } from "../../catalog-ui";
import { Icon } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
import type { HistoryViewModel } from "../history/history.viewmodel";
import type { CatalogViewModel } from "./catalog.viewmodel";
import { findUnwatchedTitle } from "./catalog-spotlight.model";

export function CatalogSpotlight(props: {
  readonly vm: CatalogViewModel;
  readonly history: HistoryViewModel;
  readonly onSelectTitle: (title: Title) => void;
}) {
  const [failedImage, setFailedImage] = createSignal("");
  const title = () => {
    if (
      !props.history.loaded() ||
      props.vm.query() ||
      props.vm.genreId() ||
      props.vm.category() !== CatalogCategory.POPULAR
    )
      return undefined;
    return findUnwatchedTitle(props.vm.titles(), props.history.entries());
  };

  return (
    <Show when={title()} keyed>
      {(featured) => (
        <section
          class="catalog-spotlight relative isolate mb-8 flex min-h-[440px] items-end overflow-hidden rounded-2xl border border-slate-6 bg-slate-1 max-[560px]:min-h-[380px]"
          aria-labelledby="spotlight-title"
        >
          <Show when={artworkUrl(featured.backdropUrl) && failedImage() !== featured.backdropUrl}>
            <img
              class="absolute inset-0 -z-20 size-full object-cover object-[center_35%]"
              src={artworkUrl(featured.backdropUrl)}
              alt=""
              fetchpriority="high"
              onError={() => setFailedImage(featured.backdropUrl)}
            />
          </Show>
          <div class="absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--slate-1)_0%,var(--black-a9)_48%,var(--black-a2)_100%)] max-[560px]:bg-[linear-gradient(0deg,var(--slate-1)_0%,var(--black-a9)_65%,var(--black-a4)_100%)]" />
          <div class="absolute inset-0 -z-10 bg-[linear-gradient(0deg,var(--slate-1),transparent_65%)]" />
          <div class="w-full max-w-[660px] p-[clamp(24px,4vw,52px)]">
            <p class="mb-4 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-slate-12 uppercase">
              <span class="size-1.5 rounded-full bg-accent" /> Em destaque
              <span class="text-slate-11">/</span>
              {featured.content?.mediaType === MediaType.TV ? "Série" : "Filme"}
            </p>
            <h2
              id="spotlight-title"
              class="text-[clamp(32px,4.5vw,60px)] font-semibold leading-[1.04] tracking-[-0.045em] text-slate-12 wrap-anywhere"
            >
              {featured.title}
            </h2>
            <div class="mt-4 flex items-center gap-4 text-[13px] text-slate-11">
              <Show when={featured.voteAverage > 0}>
                <span class="flex items-center gap-1.5 font-medium text-amber-11">
                  <Icon name="star" /> {featured.voteAverage.toFixed(1)}
                </span>
              </Show>
              <Show when={featured.releaseYear}>
                <span>{featured.releaseYear}</span>
              </Show>
            </div>
            <Show when={featured.overview}>
              <p class="mt-4 line-clamp-3 max-w-[48ch] text-sm leading-relaxed text-slate-12">
                {featured.overview}
              </p>
            </Show>
            <button
              type="button"
              class={buttonStyles({ class: "mt-6 inline-flex items-center gap-3 px-5" })}
              onClick={() => props.onSelectTitle(featured)}
            >
              Ver detalhes <Icon name="external" />
            </button>
          </div>
        </section>
      )}
    </Show>
  );
}
