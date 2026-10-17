import { Collapsible } from "@ark-ui/solid/collapsible";
import { MediaType } from "@popcorn/sdk";
import { createEffect, createSignal, For, Show } from "solid-js";
import { artworkUrl } from "../../catalog-ui";
import { Artwork } from "../../shared/ui/artwork";
import { Icon } from "../../shared/ui/icon";
import { SelectField } from "../../shared/ui/select-field";
import { buttonStyles } from "../../shared/ui/styles";
import type { PlayerViewModel } from "../player/player.viewmodel";
import type { SourcesViewModel } from "../sources/sources.viewmodel";
import { SourcesPanel } from "../sources/sources-panel";
import type { DetailsViewModel } from "./details.viewmodel";

export function DetailsPanel(props: {
  readonly vm: DetailsViewModel;
  readonly online: boolean;
  readonly sources: SourcesViewModel;
  readonly player: PlayerViewModel;
  readonly onPrepare: (sourceId: string, fileIndex: number) => void;
  readonly resumeSeconds: number;
  readonly onLaunch: (position: number) => void;
}) {
  let heading: HTMLHeadingElement | undefined;
  const [trailerOpen, setTrailerOpen] = createSignal(false);

  createEffect(() => {
    if (!props.vm.selected()) return;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  });

  return (
    <section
      class="detail-panel min-w-0 border border-line rounded-panel bg-slate-2 wrap-anywhere p-[clamp(18px,3vw,40px)] shadow-[0_18px_50px_var(--black-a4)] [&_.artwork-wide]:mb-4 [&_>_.artwork-wide]:aspect-[21/9] [&_>_.artwork-wide]:max-h-[390px] [&_>_.artwork-wide]:rounded-xl"
      aria-label="Detalhes do título"
      aria-busy={props.vm.detailBusy()}
    >
      <h2
        ref={heading}
        class="detail-heading mt-2 mb-4 text-[clamp(32px,5vw,62px)] font-semibold leading-[1.1] tracking-[-0.03em] scroll-mt-[100px] focus:outline-none"
        tabindex="-1"
      >
        {props.vm.selected()?.title || "Detalhes"}
      </h2>
      <Show when={props.vm.detailBusy()}>
        <p role="status">Carregando detalhes...</p>
      </Show>
      <Show when={props.vm.detailError()}>
        <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
          {props.vm.detailError()}
        </p>
        <button
          class={buttonStyles({ variant: "secondary" })}
          type="button"
          onClick={() => {
            const selected = props.vm.selected();
            if (selected)
              void props.vm.openTitle(selected, props.online, props.sources.selectContent);
          }}
        >
          Tentar detalhes novamente
        </button>
      </Show>
      <Show when={props.vm.detail()}>
        {(title) => (
          <>
            <Show when={props.vm.detailStale()}>
              <p class="cache-label text-amber-11 text-[12px] font-[650]">
                Detalhes: cache / offline
              </p>
            </Show>
            <Show when={artworkUrl(title().backdropUrl)}>
              <Artwork url={title().backdropUrl} title={`Cena de ${title().title}`} wide />
            </Show>
            <p class="detail-meta mt-5 mb-4 text-muted text-[14px]">
              {title().content?.mediaType === MediaType.TV ? "Série" : "Filme"} ·{" "}
              {title().releaseYear || "Ano não informado"} ·{" "}
              {title().runtimeMinutes ? `${title().runtimeMinutes} min` : "Duração não informada"} ·{" "}
              {title().voteAverage > 0
                ? `Nota ${title().voteAverage.toFixed(1)} / 10`
                : "Sem avaliação"}
            </p>
            <Show when={title().genres.length}>
              <ul class="genre-tags flex flex-wrap gap-[6px] m-[0_0_20px] p-0 list-none [&_li]:p-[3px_8px] [&_li]:border [&_li]:border-line [&_li]:rounded-[14px] [&_li]:text-ink [&_li]:text-[11px]">
                <For each={title().genres}>{(genre) => <li>{genre.name}</li>}</For>
              </ul>
            </Show>
            <h3 class="synopsis-label m-[20px_0_8px] text-ink text-[13px] uppercase tracking-[0.08em]">
              Sinopse
            </h3>
            <p class="overview max-w-[780px] text-ink text-base leading-[1.65]">
              {title().overview || "Sinopse não disponível."}
            </p>
            <Show
              when={title().trailerKey}
              fallback={
                <p class="muted text-muted trailer-unavailable mt-4 text-[13px]">
                  Trailer não disponível para este título.
                </p>
              }
            >
              <Collapsible.Root
                open={trailerOpen()}
                onOpenChange={(details) => setTrailerOpen(details.open)}
                lazyMount
                unmountOnExit
              >
                <section class="trailer-section m-[24px_0]" aria-label="Trailer">
                  <Collapsible.Trigger class={buttonStyles({ variant: "secondary" })}>
                    {trailerOpen() ? (
                      <>Fechar trailer</>
                    ) : (
                      <>
                        <Icon name="play" /> Assistir ao trailer
                      </>
                    )}
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <iframe
                      class="trailer-frame block w-full aspect-[16_/_9] mt-4 border-0 rounded-[10px]"
                      title={`Trailer de ${title().title}`}
                      src={`https://www.youtube-nocookie.com/embed/${title().trailerKey}`}
                      allow="encrypted-media; picture-in-picture; fullscreen"
                      allowfullscreen
                      referrerpolicy="strict-origin-when-cross-origin"
                    />
                  </Collapsible.Content>
                </section>
              </Collapsible.Root>
            </Show>
            <h3 class="section-label m-[20px_0_8px] text-ink text-[13px] uppercase tracking-[0.08em]">
              Elenco
            </h3>
            <Show
              when={title().cast.length}
              fallback={<p class="muted text-muted">Elenco não disponível.</p>}
            >
              <ul class="cast-list grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 m-0 p-0 list-none [&_li]:min-w-0 [&_li]:p-2 [&_li]:rounded-[4px] [&_li]:bg-slate-2 [&_strong]:block [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[12px] [&_span]:block [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap [&_span]:text-[11px]">
                <For each={title().cast}>
                  {(member) => (
                    <li>
                      <strong>{member.name}</strong>
                      <span class="muted text-muted">
                        {member.character || "Personagem não informado"}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <SourcesPanel
              sources={props.sources}
              player={props.player}
              onPrepare={props.onPrepare}
              resumeSeconds={props.resumeSeconds}
              onLaunch={props.onLaunch}
            />
            <Show when={props.online && title().content?.mediaType === MediaType.TV}>
              <section
                class="episodes-section [&_>_label]:block [&_>_label]:mb-[6px] [&_>_label]:text-muted [&_>_label]:text-[12px] [&_>_label]:font-bold mt-6 pt-4 border-t border-line [&_.select-field]:mb-3"
                aria-label="Temporadas e episódios"
              >
                <h3 class="section-label m-[20px_0_8px] text-ink text-[13px] uppercase tracking-[0.08em]">
                  Temporadas e episódios
                </h3>
                <Show when={props.vm.seasonsBusy()}>
                  <p role="status">Consultando temporadas...</p>
                </Show>
                <Show when={props.vm.seasonsStale()}>
                  <p class="cache-label text-amber-11 text-[12px] font-[650]">
                    Temporadas: cache / offline
                  </p>
                </Show>
                <Show when={props.vm.seasonsError()}>
                  <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
                    {props.vm.seasonsError()}
                  </p>
                </Show>
                <Show
                  when={
                    !props.vm.seasonsBusy() &&
                    !props.vm.seasonsError() &&
                    !props.vm.seasons().length
                  }
                >
                  <p class="muted text-muted">Temporadas não disponíveis.</p>
                </Show>
                <Show when={props.vm.seasons().length}>
                  <SelectField
                    label="Temporada"
                    value={String(
                      props.vm.seasonNumber() ?? props.vm.seasons()[0]?.seasonNumber ?? "",
                    )}
                    options={props.vm.seasons().map((season) => ({
                      value: String(season.seasonNumber),
                      label: `${season.name || `Temporada ${season.seasonNumber}`} · ${season.episodeCount} episódios`,
                    }))}
                    onChange={(value) => void props.vm.loadEpisodes(Number(value))}
                  />
                  <p class="season-overview text-muted text-[13px]">
                    {
                      props.vm
                        .seasons()
                        .find((season) => season.seasonNumber === props.vm.seasonNumber())?.overview
                    }
                  </p>
                  <Show when={props.vm.episodesBusy()}>
                    <p role="status">Consultando episódios...</p>
                  </Show>
                  <Show when={props.vm.episodesStale()}>
                    <p class="cache-label text-amber-11 text-[12px] font-[650]">
                      Episódios: cache / offline
                    </p>
                  </Show>
                  <Show when={props.vm.episodesError()}>
                    <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
                      {props.vm.episodesError()}
                    </p>
                    <button
                      class={buttonStyles({ variant: "secondary" })}
                      type="button"
                      onClick={() => {
                        const number = props.vm.seasonNumber();
                        if (number !== undefined) void props.vm.loadEpisodes(number);
                      }}
                    >
                      Tentar episódios novamente
                    </button>
                  </Show>
                  <Show
                    when={
                      !props.vm.episodesBusy() &&
                      !props.vm.episodesError() &&
                      !props.vm.episodes().length
                    }
                  >
                    <p class="muted text-muted">Episódios não disponíveis nesta temporada.</p>
                  </Show>
                  <ol class="episode-list m-[16px_0_0] pl-7 [&_li]:p-[16px_0] [&_li]:border-t [&_li]:border-line [&_.artwork-wide]:mb-3 [&_h4]:mb-[3px] [&_h4]:text-[14px] [&_p]:text-[13px]">
                    <For each={props.vm.episodes()}>
                      {(episode) => (
                        <li>
                          <Show when={artworkUrl(episode.stillUrl)}>
                            <Artwork
                              url={episode.stillUrl}
                              title={`Cena de ${episode.name}`}
                              wide
                            />
                          </Show>
                          <h4>
                            {episode.content?.episodeNumber
                              ? `${episode.content.episodeNumber}. `
                              : ""}
                            {episode.name || "Nome não informado"}
                          </h4>
                          <p class="muted text-muted">
                            {episode.airDate
                              ? `Exibição: ${episode.airDate.split("-").reverse().join("/")}`
                              : "Data não informada"}
                            {episode.runtimeMinutes ? ` · ${episode.runtimeMinutes} min` : ""}
                          </p>
                          <p>{episode.overview || "Sinopse não disponível."}</p>
                          <Show when={episode.content}>
                            {(content) => (
                              <button
                                class={buttonStyles({
                                  variant: "secondary",
                                  size: "compact",
                                  class:
                                    "episode-source-button mt-3 [&[aria-pressed=true]]:border-accent [&[aria-pressed=true]]:text-ink",
                                })}
                                type="button"
                                aria-pressed={
                                  props.sources.content()?.seasonNumber ===
                                    content().seasonNumber &&
                                  props.sources.content()?.episodeNumber === content().episodeNumber
                                }
                                onClick={() => void props.sources.selectContent(content())}
                              >
                                Usar fontes deste episódio
                              </button>
                            )}
                          </Show>
                        </li>
                      )}
                    </For>
                  </ol>
                </Show>
              </section>
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}
