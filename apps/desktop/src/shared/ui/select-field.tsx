import { createListCollection, Select } from "@ark-ui/solid/select";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./icon";
import { type SelectFieldVariants, selectFieldStyles } from "./select-field.styles";
import { createSelectScrollDismiss } from "./select-scroll";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

interface SelectFieldProps extends SelectFieldVariants {
  readonly options: readonly SelectOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly class?: string;
  readonly placement?: "bottom-start" | "top-end";
}

export function SelectField(props: SelectFieldProps) {
  const styles = createMemo(() => selectFieldStyles({ variant: props.variant ?? "default" }));
  const collection = createMemo(() => createListCollection({ items: [...props.options] }));
  const [portalMount, setPortalMount] = createSignal<HTMLDialogElement>();
  let trigger: HTMLButtonElement | undefined;
  let content: HTMLDivElement | undefined;
  const menu = createSelectScrollDismiss(() => content);

  // Native modal dialogs make portals mounted on document.body inert.
  onMount(() => setPortalMount(trigger?.closest("dialog") ?? undefined));

  return (
    <Select.Root
      class={styles().root({ class: props.class })}
      collection={collection()}
      open={menu.open()}
      onOpenChange={({ open }) => menu.setOpen(open)}
      value={[props.value]}
      disabled={props.disabled ?? false}
      positioning={{
        placement: props.placement ?? "bottom-start",
        gutter: 8,
        strategy: "fixed",
        boundary: portalMount() ?? "clipping-ancestors",
        sameWidth: Boolean(portalMount()),
        fitViewport: true,
      }}
      onValueChange={({ value }) => value[0] !== undefined && props.onChange(value[0])}
    >
      {props.label && <Select.Label class={styles().label()}>{props.label}</Select.Label>}
      <Select.Trigger
        ref={trigger}
        class={styles().trigger()}
        title={props.options.find((option) => option.value === props.value)?.label}
        {...(props.ariaLabel ? { "aria-label": props.ariaLabel } : {})}
      >
        <Select.ValueText class={styles().valueText()} />
        <Select.Indicator class={styles().indicator()} aria-hidden="true">
          <Icon name="caret-down" class={styles().caretIcon()} />
        </Select.Indicator>
      </Select.Trigger>
      <Portal mount={portalMount() ?? document.body}>
        <Select.Positioner>
          <Select.Content
            ref={content}
            class={styles().content({
              class: portalMount()
                ? "w-[var(--reference-width)] max-w-[var(--available-width)]"
                : "",
            })}
          >
            <For each={collection().items}>
              {(item) => (
                <Select.Item class={styles().item()} item={item}>
                  <Select.ItemText class={styles().itemText()}>
                    <span class="block">{item.label}</span>
                    <Show when={item.description}>
                      <span class="mt-0.5 block text-xs font-normal text-muted">
                        {item.description}
                      </span>
                    </Show>
                  </Select.ItemText>
                  <Select.ItemIndicator class={styles().itemIndicator()} aria-hidden="true">
                    <Icon name="check" class={styles().checkIcon()} />
                  </Select.ItemIndicator>
                </Select.Item>
              )}
            </For>
          </Select.Content>
        </Select.Positioner>
      </Portal>
      <Select.HiddenSelect />
    </Select.Root>
  );
}
