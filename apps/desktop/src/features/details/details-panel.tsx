import { Collapsible } from "@ark-ui/solid/collapsible";
import { MediaType } from "@popcorn/sdk";
import { createEffect, createSignal, For, Show } from "solid-js";
import { artworkUrl } from "../../catalog-ui";
import { Artwork } from "../../shared/ui/artwork";
import { Icon } from "../../shared/ui/icon";
import { SelectField } from "../../shared/ui/select-field";
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
    <section class="detail-panel" aria-label="Detalhes do título" aria-busy={props.vm.detailBusy()}>
      <h2 ref={heading} class="detail-heading" tabindex="-1">
        {props.vm.selected()?.title || "Detalhes"}
      </h2>
      <Show when={props.vm.detailBusy()}>
        <p role="status">Carregando detalhes...</p>
      </Show>
      <Show when={props.vm.detailError()}>
        <p class="error-text" role="alert">
          {props.vm.detailError()}
        </p>
        <button
          class="button secondary"
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
              <p class="cache-label">Detalhes: cache / offline</p>
            </Show>
            <Show when={artworkUrl(title().backdropUrl)}>
              <Artwork url={title().backdropUrl} title={`Cena de ${title().title}`} wide />
            </Show>
            <p class="detail-meta">
              {title().content?.mediaType === MediaType.TV ? "Série" : "Filme"} ·{" "}
              {title().releaseYear || "Ano não informado"} ·{" "}
              {title().runtimeMinutes ? `${title().runtimeMinutes} min` : "Duração não informada"} ·{" "}
              {title().voteAverage > 0
                ? `Nota ${title().voteAverage.toFixed(1)} / 10`
                : "Sem avaliação"}
            </p>
            <Show when={title().genres.length}>
              <ul class="genre-tags">
                <For each={title().genres}>{(genre) => <li>{genre.name}</li>}</For>
              </ul>
            </Show>
            <h3 class="synopsis-label">Sinopse</h3>
            <p class="overview">{title().overview || "Sinopse não disponível."}</p>
            <Show
              when={title().trailerKey}
              fallback={
                <p class="muted trailer-unavailable">Trailer não disponível para este título.</p>
              }
            >
              <Collapsible.Root
                open={trailerOpen()}
                onOpenChange={(details) => setTrailerOpen(details.open)}
                lazyMount
                unmountOnExit
              >
                <section class="trailer-section" aria-label="Trailer">
                  <Collapsible.Trigger class="button secondary">
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
                      class="trailer-frame"
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
            <h3 class="section-label">Elenco</h3>
            <Show when={title().cast.length} fallback={<p class="muted">Elenco não disponível.</p>}>
              <ul class="cast-list">
                <For each={title().cast}>
                  {(member) => (
                    <li>
                      <strong>{member.name}</strong>
                      <span class="muted">{member.character || "Personagem não informado"}</span>
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
              <section class="episodes-section" aria-label="Temporadas e episódios">
                <h3 class="section-label">Temporadas e episódios</h3>
                <Show when={props.vm.seasonsBusy()}>
                  <p role="status">Consultando temporadas...</p>
                </Show>
                <Show when={props.vm.seasonsStale()}>
                  <p class="cache-label">Temporadas: cache / offline</p>
                </Show>
                <Show when={props.vm.seasonsError()}>
                  <p class="error-text" role="alert">
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
                  <p class="muted">Temporadas não disponíveis.</p>
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
                  <p class="season-overview">
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
                    <p class="cache-label">Episódios: cache / offline</p>
                  </Show>
                  <Show when={props.vm.episodesError()}>
                    <p class="error-text" role="alert">
                      {props.vm.episodesError()}
                    </p>
                    <button
                      class="button secondary"
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
                    <p class="muted">Episódios não disponíveis nesta temporada.</p>
                  </Show>
                  <ol class="episode-list">
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
                          <p class="muted">
                            {episode.airDate
                              ? `Exibição: ${episode.airDate.split("-").reverse().join("/")}`
                              : "Data não informada"}
                            {episode.runtimeMinutes ? ` · ${episode.runtimeMinutes} min` : ""}
                          </p>
                          <p>{episode.overview || "Sinopse não disponível."}</p>
                          <Show when={episode.content}>
                            {(content) => (
                              <button
                                class="button secondary episode-source-button"
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
