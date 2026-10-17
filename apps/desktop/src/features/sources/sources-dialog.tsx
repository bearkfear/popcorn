import { createEffect, createUniqueId, onCleanup, Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
import { SourcesPanel, type SourcesPanelProps } from "./sources-panel";

export function SourcesDialog(
  props: SourcesPanelProps & {
    readonly title: string;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
  },
) {
  let dialog: HTMLDialogElement | undefined;
  const headingId = createUniqueId();
  createEffect(() => {
    if (props.open) dialog?.showModal();
    else dialog?.close();
  });
  function show() {
    props.onOpenChange(true);
  }
  function launch(position: number) {
    dialog?.close();
    props.onLaunch(position);
  }
  onCleanup(() => dialog?.close());
  return (
    <div class="detail-playback-actions my-5 flex flex-wrap gap-3">
      <button
        class={buttonStyles()}
        type="button"
        onClick={() => (props.player.mediaReady() ? props.onLaunch(props.resumeSeconds) : show())}
      >
        <Icon name="play" /> {props.resumeSeconds > 0 ? "Continuar assistindo" : "Assistir"}
      </button>
      <button class={buttonStyles({ variant: "secondary" })} type="button" onClick={show}>
        Gerenciar fontes
      </button>
      <dialog
        ref={dialog}
        class="sources-dialog fixed inset-0 m-auto max-h-[90dvh] w-[min(720px,calc(100%_-_32px))] max-w-none overflow-y-auto rounded-2xl border border-line bg-slate-2 p-0 text-ink shadow-2xl backdrop:bg-black-a9"
        aria-labelledby={headingId}
        onClose={() => props.onOpenChange(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dialog?.close();
          }
        }}
        onClick={(event) => {
          if (event.target !== dialog) return;
          const rect = dialog?.getBoundingClientRect();
          if (
            rect &&
            (event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom)
          )
            dialog?.close();
        }}
      >
        <header class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-slate-2 px-6 py-5 max-[560px]:px-4">
          <div class="min-w-0">
            <h2 id={headingId} class="m-0 text-xl font-semibold">
              Fontes de reprodução
            </h2>
            <p class="mt-1 mb-0 break-words text-sm text-muted">
              {props.title}
              <Show when={props.sources.content()?.episodeNumber}>
                {" · T"}
                {props.sources.content()?.seasonNumber} · E{props.sources.content()?.episodeNumber}
              </Show>
            </p>
          </div>
          <button
            class="grid size-9 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-muted transition-colors hover:bg-soft hover:text-ink"
            type="button"
            aria-label="Fechar fontes"
            title="Fechar"
            onClick={() => dialog?.close()}
          >
            <Icon name="close" class="size-5" />
          </button>
        </header>
        <div class="p-6 max-[560px]:p-4">
          <Show when={props.open}>
            <SourcesPanel {...props} onLaunch={launch} />
          </Show>
        </div>
      </dialog>
    </div>
  );
}
