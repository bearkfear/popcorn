import { tv, type VariantProps } from "tailwind-variants";

export const buttonStyles = tv({
  base: [
    "button border rounded-control text-[13px] font-bold",
    "transition-[background-color,border-color,transform] duration-[120ms] ease-[ease]",
    "[&:active:not(:disabled)]:translate-y-px",
  ],
  variants: {
    variant: {
      primary:
        "border-transparent bg-accent text-accent-contrast [&:hover:not(:disabled)]:bg-accent-hover",
      secondary: [
        "secondary border-line bg-surface text-ink",
        "[&:hover:not(:disabled)]:border-slate-8 [&:hover:not(:disabled)]:bg-soft",
        "aria-pressed:border-slate-8 aria-pressed:bg-slate-5 data-[state=on]:border-slate-8 data-[state=on]:bg-slate-5",
      ],
    },
    tone: { default: "", danger: "danger text-negative" },
    size: {
      default: "min-h-[42px] px-4 py-[9px]",
      compact: "min-h-9 px-2.5 py-1.5",
      tab: "min-h-10 px-[13px] py-[7px] max-[560px]:flex-none",
    },
  },
  defaultVariants: { variant: "primary", tone: "default", size: "default" },
});

export type ButtonVariants = VariantProps<typeof buttonStyles>;
