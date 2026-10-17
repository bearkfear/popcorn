import { createListCollection, Select } from "@ark-ui/solid/select";
import { createMemo, For } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./icon";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps {
  readonly options: readonly SelectOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly class?: string;
  readonly variant?: "default" | "player";
  readonly placement?: "bottom-start" | "top-end";
}

export function SelectField(props: SelectFieldProps) {
  const collection = createMemo(() => createListCollection({ items: [...props.options] }));

  return (
    <Select.Root
      class={`select-field min-w-0 ${props.class ? `  ${props.class}` : ""}`}
      collection={collection()}
      value={[props.value]}
      disabled={props.disabled ?? false}
      positioning={{ placement: props.placement ?? "bottom-start", gutter: 8 }}
      onValueChange={({ value }) => value[0] !== undefined && props.onChange(value[0])}
    >
      {props.label && (
        <Select.Label class="select-field-label block mb-[6px] text-muted text-[12px] font-bold">
          {props.label}
        </Select.Label>
      )}
      <Select.Trigger
        class={`select-field-trigger flex w-full min-w-0 items-center justify-between text-ink text-left border disabled:cursor-default disabled:opacity-[0.55] ${
          props.variant === "player"
            ? "video-audio-select h-9 min-h-9 gap-1.5 px-[9px] py-0 border-white-a3 rounded-[9px] bg-white-a1 text-[12px] font-semibold cursor-pointer transition-[background,border-color] duration-150 ease-[ease] [&_[data-part=value-text]]:min-w-0 [&_[data-part=value-text]]:truncate [&_[data-part=indicator]]:flex [&_[data-part=indicator]]:flex-none [&_[data-part=indicator]]:text-slate-11 [&_[data-part=indicator]]:transition-transform [&_[data-part=indicator]]:duration-150 [&:hover]:border-white-a5 [&:hover]:bg-white-a2 data-[state=open]:border-accent-strong data-[state=open]:bg-tomato-a3 [&[data-state=open]_[data-part=indicator]]:text-accent-strong [&[data-state=open]_[data-part=indicator]]:rotate-180 focus-visible:outline-2 focus-visible:outline-accent-strong focus-visible:outline-offset-[3px]"
            : "min-h-11 gap-3 px-3 py-[9px] border-line rounded-control bg-slate-2"
        }`}
        title={props.options.find((option) => option.value === props.value)?.label}
        {...(props.ariaLabel ? { "aria-label": props.ariaLabel } : {})}
      >
        <Select.ValueText />
        <Select.Indicator aria-hidden="true">
          <Icon name="caret-down" class={props.variant === "player" ? "size-3.5" : "size-[1em]"} />
        </Select.Indicator>
      </Select.Trigger>
      <Portal>
        <Select.Positioner>
          <Select.Content
            class={`select-field-content select-field-listbox z-50 max-h-[min(320px,var(--available-height,320px))] overflow-auto border bg-surface shadow-[0_12px_32px_var(--black-a6)] m-0 outline-none list-none ${
              props.variant === "player"
                ? "video-audio-menu w-[min(224px,calc(100vw-32px))] p-1.5 border-white-a3 rounded-xl [&_[data-part=item-text]]:min-w-0 [&_[data-part=item-text]]:wrap-anywhere [&_[data-part=item-indicator]]:flex [&_[data-part=item-indicator]]:shrink-0"
                : "w-[min(360px,calc(100vw-32px))] p-1 border-line rounded-control"
            }`}
          >
            <For each={collection().items}>
              {(item) => (
                <Select.Item
                  class={`select-field-item flex items-center justify-between gap-3 text-ink cursor-pointer text-[13px] data-[highlighted]:outline-none data-[state=checked]:text-accent-strong ${
                    props.variant === "player"
                      ? "min-h-10 p-2.5 rounded-[7px] leading-[1.4] [&[data-state=checked]:not([data-highlighted])]:bg-tomato-a2 data-[highlighted]:bg-white-a2"
                      : "min-h-9 px-[9px] py-[7px] rounded-[3px] data-[highlighted]:bg-soft"
                  }`}
                  item={item}
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator aria-hidden="true">
                    <Icon
                      name="check"
                      class={props.variant === "player" ? "size-4" : "size-[1em]"}
                    />
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
