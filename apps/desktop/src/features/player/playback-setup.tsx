import { createEffect, For, Show } from "solid-js";
import { playbackQualities } from "../../shared/types";
import type { PlayerViewModel } from "./player.viewmodel";

export function PlaybackSetup(props: {
  readonly vm: PlayerViewModel;
  readonly resumeSeconds: number;
  readonly onLaunch: (position: number) => void;
}) {
  let heading: HTMLHeadingElement | undefined;
  const audio = () => props.vm.playback()?.audioTracks ?? [];
  const languages: Record<string, string> = {
    por: "Português",
    pt: "Português",
    eng: "Inglês",
    en: "Inglês",
    spa: "Espanhol",
    es: "Espanhol",
    fra: "Francês",
    fre: "Francês",
    fr: "Francês",
    deu: "Alemão",
    ger: "Alemão",
    de: "Alemão",
    jpn: "Japonês",
    ja: "Japonês",
    kor: "Coreano",
    ko: "Coreano",
    ita: "Italiano",
    it: "Italiano",
  };
  createEffect(() => {
    if (!props.vm.preparedFile()) return;
    queueMicrotask(() =>
      heading?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      }),
    );
  });
  return (
    <section class="playback-setup" aria-label="Opções de reprodução">
      <div>
        <p class="eyebrow">DO SEU JEITO</p>
        <h3 ref={heading}>Prepare a sessão</h3>
      </div>
      <div class="playback-options">
        <label>
          Qualidade
          <select
            value={props.vm.quality()}
            disabled={props.vm.busy()}
            onChange={(event) => {
              const option = playbackQualities.find(
                (item) => String(item.value) === event.currentTarget.value,
              );
              if (option) props.vm.setQuality(option.value);
            }}
          >
            <For each={playbackQualities}>
              {(item) => <option value={item.value}>{item.label}</option>}
            </For>
          </select>
        </label>
        <label>
          Áudio
          <select
            value={props.vm.audioStreamIndex() ?? props.vm.playback()?.audioStreamIndex ?? ""}
            disabled={props.vm.busy() || !audio().length}
            onChange={(event) => props.vm.setAudioStreamIndex(Number(event.currentTarget.value))}
          >
            <Show when={!audio().length}>
              <option value="">
                {props.vm.mediaReady() ? "Sem faixa de áudio" : "Selecione e prepare um arquivo"}
              </option>
            </Show>
            <For each={audio()}>
              {(track) => (
                <option value={track.streamIndex}>
                  {languages[track.language.toLowerCase()] ||
                    (track.language && track.language !== "und"
                      ? track.language
                      : `Faixa ${track.streamIndex}`)}{" "}
                  · {track.title || track.codec.toUpperCase()} · {track.channels} canais
                  {track.isDefault ? " · padrão" : ""}
                </option>
              )}
            </For>
          </select>
        </label>
      </div>
      <Show when={props.vm.preparedFile() && !props.vm.mediaReady() && !props.vm.displayError()}>
        <p class="muted" role="status">
          Analisando vídeo e faixas de áudio…
        </p>
      </Show>
      <Show when={props.vm.displayError()}>
        <p class="error-text" role="alert">
          {props.vm.displayError()}
        </p>
        <button
          class="button secondary"
          type="button"
          disabled={props.vm.busy()}
          onClick={() => void props.vm.retry()}
        >
          Tentar preparar novamente
        </button>
      </Show>
      <Show when={props.vm.mediaReady()}>
        <div class="cluster playback-launch">
          <button
            class="button"
            type="button"
            disabled={props.vm.busy()}
            onClick={() => props.onLaunch(props.resumeSeconds)}
          >
            {props.resumeSeconds > 0
              ? `▶ Continuar de ${Math.floor(props.resumeSeconds / 60)} min`
              : "▶ Reproduzir"}
          </button>
          <Show when={props.resumeSeconds > 0}>
            <button class="button secondary" type="button" onClick={() => props.onLaunch(0)}>
              Assistir do início
            </button>
          </Show>
        </div>
      </Show>
    </section>
  );
}
