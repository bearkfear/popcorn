// Modela com Tailwind Variants a ilustração responsiva da interface do produto.
import { tv } from "tailwind-variants";

export const preview = tv({
	slots: {
		stage: "relative z-[2] h-[clamp(27rem,38vw,35.625rem)] [perspective:87.5rem] max-[65.625rem]:h-[33.75rem] max-[47.5rem]:-mx-5 max-[47.5rem]:h-100 max-[47.5rem]:overflow-hidden",
		glow: "absolute inset-[13%_3%_8%] rounded-[50%] bg-[var(--tomato-a5)] blur-3xl",
		window: "absolute left-0 top-[2.625rem] aspect-[76/45] min-h-96 w-[95%] origin-left overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_48px_110px_var(--black-a9)] [transform:rotateY(-7deg)_rotateX(2deg)] max-[65.625rem]:left-[5%] max-[65.625rem]:h-[28.125rem] max-[65.625rem]:w-[90%] max-[47.5rem]:left-[1.375rem] max-[47.5rem]:h-[22.8125rem] max-[47.5rem]:min-h-0 max-[47.5rem]:w-[38.75rem] max-[47.5rem]:[transform:scale(.82)_rotateY(-5deg)]",
		windowBar: "grid h-10 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-surface-raised px-3.5 text-[0.5625rem] text-text-subtle [&>svg]:justify-self-end",
		windowDots: "flex gap-1.5 [&_i]:size-2 [&_i]:rounded-full [&_i]:bg-[var(--slate-7)]",
		windowBody: "flex h-[calc(100%-2.5rem)]",
		sidebar: "flex w-14 flex-col items-center gap-5 border-r border-line py-4 text-text-subtle [&>svg:first-of-type]:text-accent-hover",
		miniLogo: "relative mb-2 size-6 rounded-md bg-paper-surface [&_span]:absolute [&_span]:top-1 [&_span]:size-2 [&_span]:rounded-full [&_span]:bg-gold [&_span:nth-child(1)]:left-1 [&_span:nth-child(2)]:left-2 [&_span:nth-child(2)]:top-0.5 [&_span:nth-child(3)]:right-1",
		catalog: "min-w-0 flex-1 bg-[radial-gradient(circle_at_72%_-20%,var(--slate-5)_0,var(--slate-3)_36%,var(--slate-2)_100%)] px-6 py-7",
		catalogTopline: "flex items-end justify-between [&_small]:block [&_small]:text-[0.5rem] [&_small]:font-bold [&_small]:tracking-[.17em] [&_small]:text-accent-hover [&_strong]:mt-1 [&_strong]:block [&_strong]:text-lg [&_strong]:tracking-[-.03em]",
		fakeSearch: "flex h-7 w-40 items-center gap-2 rounded-md border border-line bg-surface-raised px-2.5 text-[0.5rem] text-text-subtle max-[80rem]:hidden",
		posterRow: "mt-6 grid grid-cols-4 gap-3",
		posterCard: "[&>strong]:mt-2 [&>strong]:block [&>strong]:overflow-hidden [&>strong]:text-ellipsis [&>strong]:whitespace-nowrap [&>strong]:text-[0.625rem] [&>strong]:font-semibold [&>small]:text-[0.5rem] [&>small]:text-text-subtle",
		posterPlay: "absolute bottom-2 right-2 z-[3] grid size-6 place-items-center rounded-full bg-paper-surface text-paper-text",
		chipIcon: "flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--tomato-a4)] text-accent-text [&>svg]:block",
	},
});

export const poster = tv({
	base: "relative aspect-[.68] overflow-hidden rounded-lg bg-surface-hover shadow-[0_12px_26px_var(--black-a7)] after:absolute after:inset-0 after:bg-[linear-gradient(180deg,transparent_45%,var(--black-a11))] [&>span]:absolute [&>span]:bottom-2.5 [&>span]:left-2 [&>span]:z-[2] [&>span]:text-[0.5rem] [&>span]:uppercase [&>span]:tracking-[.1em] [&>span]:text-text-muted",
	variants: {
		art: {
			one: "bg-[radial-gradient(circle_at_70%_20%,var(--amber-9)_0_8%,transparent_9%),linear-gradient(145deg,var(--blue-7),var(--blue-2)_60%,var(--bronze-9))]",
			two: "bg-[radial-gradient(circle_at_50%_38%,var(--slate-12)_0_9%,transparent_10%),radial-gradient(circle_at_50%_50%,var(--ruby-8),var(--slate-3)_42%,var(--slate-1)_72%)]",
			three: "bg-[linear-gradient(155deg,transparent_40%,var(--teal-4)_41%_60%,transparent_61%),linear-gradient(30deg,var(--bronze-11),var(--slate-8)_45%,var(--slate-2))]",
			four: "bg-[radial-gradient(ellipse_at_50%_82%,var(--ruby-9),transparent_50%),linear-gradient(180deg,var(--blue-4),var(--slate-1))]",
		},
	},
});

export const playerChip = tv({
	base: "absolute z-[4] flex items-center gap-3 rounded-xl border border-line bg-[color-mix(in_oklab,var(--slate-3)_92%,transparent)] px-4 py-3 shadow-[0_18px_42px_var(--black-a7)] backdrop-blur-md [&_small]:block [&_small]:text-[0.5rem] [&_small]:font-bold [&_small]:tracking-[.12em] [&_small]:text-text-subtle [&_strong]:mt-0.5 [&_strong]:block [&_strong]:text-xs",
	variants: {
		position: {
			left: "bottom-5 left-[-2%] max-[65.625rem]:left-[2%] max-[47.5rem]:bottom-1 max-[47.5rem]:left-4",
			right: "bottom-[4.625rem] right-[3%] max-[65.625rem]:right-[5%] max-[47.5rem]:bottom-[3.375rem] max-[47.5rem]:right-4",
		},
	},
});
