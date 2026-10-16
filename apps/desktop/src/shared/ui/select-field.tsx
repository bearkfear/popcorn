import { Select } from "@kobalte/core/select";
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
}

export function SelectField(props: SelectFieldProps) {
  const selectedOption = () => props.options.find((option) => option.value === props.value) ?? null;

  return (
    <Select
      class={`select-field${props.class ? ` ${props.class}` : ""}`}
      options={[...props.options]}
      optionValue={(option) => option.value}
      optionTextValue={(option) => option.label}
      value={selectedOption()}
      {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
      onChange={(option) => option && props.onChange(option.value)}
      itemComponent={(itemProps) => (
        <Select.Item class="select-field-item" item={itemProps.item}>
          <Select.ItemLabel>{itemProps.item.rawValue?.label}</Select.ItemLabel>
          <Select.ItemIndicator aria-hidden="true">
            <Icon name="check" />
          </Select.ItemIndicator>
        </Select.Item>
      )}
    >
      {props.label && <Select.Label class="select-field-label">{props.label}</Select.Label>}
      <Select.Trigger
        class={`select-field-trigger${props.triggerClass ? ` ${props.triggerClass}` : ""}`}
        {...(props.ariaLabel ? { "aria-label": props.ariaLabel } : {})}
      >
        <Select.Value<SelectOption>>{(state) => state.selectedOption()?.label ?? ""}</Select.Value>
        <Select.Icon aria-hidden="true">
          <Icon name="caret-down" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class="select-field-content">
          <Select.Listbox class="select-field-listbox" />
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
