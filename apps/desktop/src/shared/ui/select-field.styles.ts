import { tv, type VariantProps } from "tailwind-variants";

export const selectFieldStyles = tv({
  slots: {
    trigger: [
      "select-field-trigger flex w-full min-w-0 items-center justify-between text-ink text-left border",
      "disabled:cursor-default disabled:opacity-[0.55] group/select",
    ],
    content: [
      "select-field-content select-field-listbox z-50 max-h-[min(320px,var(--available-height,320px))]",
      "overflow-auto border bg-surface shadow-[0_12px_32px_var(--black-a6)] m-0 outline-none list-none",
    ],
    item: [
      "select-field-item flex items-center justify-between gap-3 text-ink cursor-pointer text-[13px]",
      "data-[highlighted]:outline-none data-[state=checked]:text-accent-strong",
    ],
    root: "select-field min-w-0",
    label: "select-field-label block mb-[6px] text-muted text-[12px] font-bold",
    caretIcon: "size-[1em]",
    checkIcon: "size-[1em]",
    valueText: "",
    indicator: "",
    itemText: "",
    itemIndicator: "",
  },
  variants: {
    variant: {
      default: {
        trigger: "min-h-11 gap-3 px-3 py-[9px] border-line rounded-control bg-slate-2",
        content: "w-[min(360px,calc(100vw-32px))] p-1 border-line rounded-control",
        item: "min-h-9 px-[9px] py-[7px] rounded-[3px] data-[highlighted]:bg-soft",
      },
      genre: {
        root: "genre-select grid col-span-full grid-cols-subgrid items-center gap-3 max-[560px]:grid-cols-1",
        label: "genre-select-label mb-0",
        trigger:
          "genre-select-trigger min-h-10 gap-3 px-3 py-2 border-line rounded-control bg-slate-2 disabled:opacity-[0.65]",
        content:
          "genre-select-content genre-select-listbox w-[min(280px,calc(100vw-32px))] p-1 border-line rounded-control",
        item: "genre-select-item min-h-9 px-[9px] py-[7px] rounded-[3px] data-[highlighted]:bg-soft",
        indicator: "text-muted",
      },
      player: {
        trigger: [
          "video-audio-select h-9 min-h-9 gap-1.5 px-[9px] py-0 border-white-a3 rounded-[9px] bg-white-a1 text-[12px]",
          "font-semibold cursor-pointer transition-[background,border-color] duration-150 ease-[ease]",
          "[&:hover]:border-white-a5 [&:hover]:bg-white-a2 data-[state=open]:border-accent-strong",
          "data-[state=open]:bg-tomato-a3 focus-visible:outline-2 focus-visible:outline-accent-strong",
          "focus-visible:outline-offset-[3px]",
        ],
        content:
          "video-audio-menu w-[min(224px,calc(100vw-32px))] p-1.5 border-white-a3 rounded-xl",
        item: [
          "min-h-10 p-2.5 rounded-[7px] leading-[1.4] [&[data-state=checked]:not([data-highlighted])]:bg-tomato-a2",
          "data-[highlighted]:bg-white-a2",
        ],
        valueText: "min-w-0 truncate",
        indicator: [
          "flex flex-none text-slate-11 transition-transform duration-150",
          "group-data-[state=open]/select:text-accent-strong group-data-[state=open]/select:rotate-180",
        ],
        caretIcon: "size-3.5",
        checkIcon: "size-4",
        itemText: "min-w-0 wrap-anywhere",
        itemIndicator: "flex shrink-0",
      },
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type SelectFieldVariants = VariantProps<typeof selectFieldStyles>;
