import { Button } from "@egcs/newui/actions";
import { Dialog } from "@egcs/newui/overlays";
import { Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import { SourcesPanel, type SourcesPanelProps } from "./sources-panel";

export function SourcesDialog(
  props: SourcesPanelProps & {
    readonly title: string;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
  },
) {
  let trigger: HTMLButtonElement | undefined;
  function launch(position: number) {
    props.onOpenChange(false);
    props.onLaunch(position);
  }
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={({ open }) => props.onOpenChange(open)}
      finalFocusEl={() => trigger ?? null}
    >
      <div class="detail-playback-actions my-4 flex flex-wrap gap-2">
        <Button
          startIcon={<Icon name="play" />}
          onClick={() =>
            props.player.mediaReady()
              ? props.onLaunch(props.resumeSeconds)
              : props.onOpenChange(true)
          }
        >
          {props.resumeSeconds > 0 ? "Continuar assistindo" : "Assistir"}
        </Button>
        <Button
          ref={trigger}
          variant="outline"
          tone="neutral"
          onClick={() => props.onOpenChange(true)}
        >
          Gerenciar fontes
        </Button>
      </div>
      <Dialog.Content class="sources-dialog" size="lg">
        <Dialog.Header>
          <Dialog.Title>Fontes de reprodução</Dialog.Title>
          <Dialog.Description>
            {props.title}
            <Show when={props.sources.content()?.episodeNumber}>
              {" · T"}
              {props.sources.content()?.seasonNumber} · E{props.sources.content()?.episodeNumber}
            </Show>
          </Dialog.Description>
          <Dialog.CloseTrigger aria-label="Fechar fontes" />
        </Dialog.Header>
        <Dialog.Body>
          <Show when={props.open}>
            <SourcesPanel {...props} onLaunch={launch} />
          </Show>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog.Root>
  );
}
