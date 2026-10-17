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
  readonly triggerClass?: string;
  readonly contentClass?: string;
  readonly placement?: "bottom-start" | "top-end";
}

export function SelectField(props: SelectFieldProps) {
  const collection = createMemo(() => createListCollection({ items: [...props.options] }));

  return (
    <Select.Root
      class={`select-field${props.class ? ` ${props.class}` : ""}`}
      collection={collection()}
      value={[props.value]}
      disabled={props.disabled ?? false}
      positioning={{ placement: props.placement ?? "bottom-start", gutter: 8 }}
      onValueChange={({ value }) => value[0] !== undefined && props.onChange(value[0])}
    >
      {props.label && <Select.Label class="select-field-label">{props.label}</Select.Label>}
      <Select.Trigger
        class={`select-field-trigger${props.triggerClass ? ` ${props.triggerClass}` : ""}`}
        title={props.options.find((option) => option.value === props.value)?.label}
        {...(props.ariaLabel ? { "aria-label": props.ariaLabel } : {})}
      >
        <Select.ValueText />
        <Select.Indicator aria-hidden="true">
          <Icon name="caret-down" />
        </Select.Indicator>
      </Select.Trigger>
      <Portal>
        <Select.Positioner>
          <Select.Content
            class={`select-field-content select-field-listbox${props.contentClass ? ` ${props.contentClass}` : ""}`}
          >
            <For each={collection().items}>
              {(item) => (
                <Select.Item class="select-field-item" item={item}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator aria-hidden="true">
                    <Icon name="check" />
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
