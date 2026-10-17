// Define as variantes Tailwind dos cartões e estados da área de downloads.
import { tv } from "tailwind-variants";

export const downloadCard = tv({
	slots: {
		root: "flex min-h-[21.875rem] flex-col rounded-xl border border-line bg-[linear-gradient(145deg,var(--slate-a3),var(--slate-a2))] p-6 transition-colors duration-200 hover:border-line-strong",
		topline: "flex items-center justify-between",
		icon: "grid size-12 place-items-center rounded-xl border border-line bg-[var(--slate-a3)]",
		badge: "rounded-full border border-[var(--tomato-a6)] bg-[var(--tomato-a3)] px-2.5 py-1 text-[0.5rem] font-extrabold uppercase tracking-[.12em] text-accent-text",
		copy: "[&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-2xl [&_h3]:tracking-[-.04em] [&_p]:text-sm [&_p]:leading-[1.55] [&_p]:text-text-subtle",
		meta: "mt-auto flex min-h-5 justify-between gap-3 pb-3 pt-7 text-[0.625rem] text-text-subtle",
		button: "flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-accent text-xs font-bold text-accent-contrast hover:bg-accent-hover disabled:cursor-wait disabled:opacity-75",
		checksum: "mx-auto mt-3 inline-flex items-center gap-1.5 text-[0.625rem] text-text-subtle hover:text-text",
	},
	variants: {
		recommended: {
			true: {
				root: "border-[var(--tomato-a8)] shadow-[inset_0_0_0_1px_var(--tomato-a3),0_18px_50px_var(--black-a5)]",
			},
		},
		future: {
			true: {
				root: "min-h-[21.875rem] opacity-70 max-[65.625rem]:col-span-full max-[65.625rem]:min-h-60 max-[47.5rem]:col-auto",
				badge: "border-line bg-transparent text-text-subtle",
				button: "mt-auto border border-line bg-[var(--slate-a2)] text-text-muted",
			},
		},
	},
});

export const downloads = tv({
	slots: {
		section: "bg-surface px-[clamp(1.5rem,8vw,8.125rem)] py-[clamp(5.5rem,10vw,9.375rem)] max-[47.5rem]:px-5 max-[47.5rem]:py-20",
		heading: "max-w-[49.375rem] [&_h2]:m-0 [&_h2]:text-[clamp(2.625rem,5vw,4.5rem)] [&_h2]:font-[580] [&_h2]:leading-[1.04] [&_h2]:tracking-[-.06em] max-[47.5rem]:[&_h2]:text-[2.75rem] [&>p:last-child]:max-w-[40.625rem] [&>p:last-child]:text-base [&>p:last-child]:leading-[1.6] [&>p:last-child]:text-text-muted",
		status: "my-6 flex min-h-9 w-max max-w-full items-center gap-2 rounded-full border border-line bg-[var(--slate-a2)] px-3 py-2 text-xs text-text-muted max-[47.5rem]:flex-wrap max-[47.5rem]:items-start max-[47.5rem]:rounded-xl [&>svg:not(.animate-spin)]:text-success [&_a]:ml-2 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-accent-text max-[47.5rem]:[&_a]:ml-6 max-[47.5rem]:[&_a]:w-full",
		grid: "grid grid-cols-[1fr_1fr_.72fr] gap-3.5 max-[65.625rem]:grid-cols-2 max-[47.5rem]:grid-cols-1",
	},
});
