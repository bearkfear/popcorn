import { createListCollection } from "@ark-ui/solid/select";
import { Select } from "@egcs/newui/forms";
import { createMemo, For, Show } from "solid-js";
import { createSelectScrollDismiss } from "./select-scroll";

export interface AppSelectOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

// Application selectors. Playback retains its existing SelectField contract.
export function AppSelect(props: {
  readonly options: readonly AppSelectOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly class?: string;
}) {
  const collection = createMemo(() => createListCollection({ items: [...props.options] }));
  let content: HTMLDivElement | undefined;
  const menu = createSelectScrollDismiss(() => content);
  return (
    <Select.Root
      class={props.class}
      size="md"
      collection={collection()}
      value={[props.value]}
      disabled={props.disabled ?? false}
      open={menu.open()}
      onOpenChange={({ open }) => menu.setOpen(open)}
      onValueChange={({ value }) => value[0] !== undefined && props.onChange(value[0])}
      positioning={{ placement: "bottom-start", sameWidth: true, fitViewport: true, gutter: 4 }}
    >
      <Show when={props.label}>
        <Select.Label class="app-control-label">{props.label}</Select.Label>
      </Show>
      <Select.Trigger aria-label={props.ariaLabel}>
        <Select.ValueText />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Content ref={content}>
        <For each={collection().items}>
          {(item) => (
            <Select.Item item={item}>
              <Select.ItemText>
                <span class="block">{item.label}</span>
                <Show when={item.description}>
                  <span class="mt-1 block text-xs text-muted">{item.description}</span>
                </Show>
              </Select.ItemText>
              <Select.ItemIndicator />
            </Select.Item>
          )}
        </For>
      </Select.Content>
    </Select.Root>
  );
}
