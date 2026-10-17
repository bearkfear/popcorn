import { createEffect, Show } from "solid-js";
import { playbackQualities } from "../../shared/types";
import { Icon } from "../../shared/ui/icon";
import { SelectField } from "../../shared/ui/select-field";
import { buttonStyles } from "../../shared/ui/styles";
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
    <section
      class="playback-setup mt-6 rounded-xl border border-line bg-surface p-5 min-[600px]:p-6"
      aria-label="Opções de reprodução"
    >
      <div>
        <p class="eyebrow m-0 mb-1 text-accent-strong text-[11px] font-bold tracking-[0.13em]">
          DO SEU JEITO
        </p>
        <h3 ref={heading} class="m-0 text-base font-semibold">
          Prepare a sessão
        </h3>
      </div>
      <div class="playback-options my-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4 max-[600px]:grid-cols-1">
        <SelectField
          label="Qualidade"
          value={String(props.vm.quality())}
          disabled={props.vm.busy()}
          options={playbackQualities.map((item) => ({
            ...item,
            value: String(item.value),
          }))}
          onChange={(value) => {
            const option = playbackQualities.find((item) => String(item.value) === value);
            if (option) props.vm.setQuality(option.value);
          }}
        />
        <SelectField
          label="Áudio"
          value={String(props.vm.audioStreamIndex() ?? props.vm.playback()?.audioStreamIndex ?? "")}
          disabled={props.vm.busy() || !audio().length}
          options={
            audio().length
              ? audio().map((track) => ({
                  value: String(track.streamIndex),
                  label: `${languages[track.language.toLowerCase()] || (track.language && track.language !== "und" ? track.language : `Faixa ${track.streamIndex}`)} · ${track.title || track.codec.toUpperCase()} · ${track.channels} canais${track.isDefault ? " · padrão" : ""}`,
                }))
              : [
                  {
                    value: "",
                    label: props.vm.mediaReady()
                      ? "Sem faixa de áudio"
                      : "Selecione e prepare um arquivo",
                  },
                ]
          }
          onChange={(value) => props.vm.setAudioStreamIndex(Number(value))}
        />
      </div>
      <Show when={props.vm.preparedFile() && !props.vm.mediaReady() && !props.vm.displayError()}>
        <p class="muted text-muted" role="status">
          Analisando vídeo e faixas de áudio…
        </p>
      </Show>
      <Show when={props.vm.displayError()}>
        <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
          {props.vm.displayError()}
        </p>
        <button
          class={buttonStyles({ variant: "secondary" })}
          type="button"
          disabled={props.vm.busy()}
          onClick={() => void props.vm.retry()}
        >
          Tentar preparar novamente
        </button>
      </Show>
      <Show when={props.vm.mediaReady()}>
        <div class="cluster flex flex-wrap items-center justify-between gap-3 playback-launch justify-start">
          <button
            class={buttonStyles()}
            type="button"
            disabled={props.vm.busy()}
            onClick={() => props.onLaunch(props.resumeSeconds)}
          >
            {props.resumeSeconds > 0 ? (
              <>
                <Icon name="play" /> Continuar de {Math.floor(props.resumeSeconds / 60)} min
              </>
            ) : (
              <>
                <Icon name="play" /> Reproduzir
              </>
            )}
          </button>
          <Show when={props.resumeSeconds > 0}>
            <button
              class={buttonStyles({ variant: "secondary" })}
              type="button"
              onClick={() => props.onLaunch(0)}
            >
              Assistir do início
            </button>
          </Show>
        </div>
      </Show>
    </section>
  );
}
