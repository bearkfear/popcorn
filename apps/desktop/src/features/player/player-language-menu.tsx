import { Popover } from "@ark-ui/solid/popover";
import type { Playback } from "@popcorn/sdk";
import { createSignal, For } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import { playerButtonStyles } from "./player-controls.styles";

function trackLabel(track: Playback["audioTracks"][number]): string {
  const languages: Record<string, string> = {
    por: "Português",
    pt: "Português",
    eng: "Inglês",
    en: "Inglês",
    spa: "Espanhol",
    es: "Espanhol",
  };
  const language =
    languages[track.language.toLowerCase()] || track.language || `Faixa ${track.streamIndex}`;
  const title = track.title.trim();
  return `${language}${title && title.toLowerCase() !== language.toLowerCase() ? ` · ${title}` : ""}`;
}

// Audio and future subtitle choices share this surface without widening the toolbar.
export function PlayerLanguageMenu(props: {
  tracks: Playback["audioTracks"];
  selected: number | undefined;
  onChange: (index: number) => void;
}) {
  const [open, setOpen] = createSignal(false);
  return (
    <Popover.Root
      open={open()}
      onOpenChange={(details) => setOpen(details.open)}
      positioning={{ placement: "top-end", gutter: 12, fitViewport: true }}
      lazyMount
      unmountOnExit
    >
      <Popover.Trigger
        class={playerButtonStyles()}
        type="button"
        aria-label="Idiomas"
        title="Idiomas"
      >
        <Icon name="languages" class="size-5" />
      </Popover.Trigger>
      <Popover.Positioner class="z-50">
        <Popover.Content class="video-language-menu w-[min(288px,calc(100vw-40px))] max-h-[min(320px,var(--available-height))] overflow-y-auto overscroll-contain rounded-2xl border border-white-a3 bg-slate-3 p-2 text-ink shadow-xl outline-none">
          <div class="flex items-center justify-between gap-3 px-2 pb-1">
            <Popover.Title class="m-0 text-sm font-semibold">Idiomas</Popover.Title>
            <Popover.CloseTrigger
              class={playerButtonStyles()}
              type="button"
              aria-label="Fechar idiomas"
            >
              <Icon name="close" class="size-4" />
            </Popover.CloseTrigger>
          </div>
          <fieldset class="m-0 min-w-0 border-0 p-0">
            <legend class="px-2 pb-2 text-xs font-medium text-muted">Áudio</legend>
            <For each={props.tracks}>
              {(track) => (
                <label class="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white-a2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink has-[:checked]:bg-white-a2">
                  <input
                    class="peer sr-only"
                    type="radio"
                    name="player-audio"
                    value={track.streamIndex}
                    checked={track.streamIndex === (props.selected ?? props.tracks[0]?.streamIndex)}
                    onChange={() => {
                      setOpen(false);
                      if (track.streamIndex !== (props.selected ?? props.tracks[0]?.streamIndex))
                        props.onChange(track.streamIndex);
                    }}
                  />
                  <span class="min-w-0 flex-1 wrap-anywhere">{trackLabel(track)}</span>
                  <Icon name="check" class="size-4 invisible peer-checked:visible" />
                </label>
              )}
            </For>
          </fieldset>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}
