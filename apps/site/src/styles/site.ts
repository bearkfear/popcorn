// Reúne as variantes Tailwind compartilhadas pela landing page e pela página 404.
import { tv } from "tailwind-variants";

export const action = tv({
	base: "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg px-5 text-sm font-[690] transition-colors duration-200 ease-out",
	variants: {
		intent: {
			primary:
				"bg-accent text-accent-contrast shadow-[0_12px_34px_var(--tomato-a5)] hover:bg-accent-hover",
			secondary:
				"border border-line bg-[var(--slate-a2)] text-text-muted hover:bg-[var(--slate-a4)]",
		},
	},
	defaultVariants: { intent: "primary" },
});

export const eyebrow = tv({
	base: "mb-5 flex items-center gap-2.5 text-xs font-bold uppercase tracking-[.18em] before:h-px before:w-6 before:bg-accent",
	variants: {
		tone: {
			dark: "text-text-muted",
			paper: "text-paper-muted",
			accent: "text-[var(--tomato-3)] before:bg-[var(--tomato-3)]",
		},
		centered: {
			true: "justify-center after:h-px after:w-6 after:bg-accent",
		},
	},
	defaultVariants: { tone: "dark" },
});

export const page = tv({
	slots: {
		skipLink:
			"fixed left-4 top-3 z-[100] -translate-y-[160%] rounded-lg bg-paper-surface px-3.5 py-2.5 text-paper-text transition-transform duration-200 focus:translate-y-0",
		header:
			"fixed inset-x-0 top-0 z-50 grid h-19 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-[color-mix(in_oklab,var(--slate-1)_78%,transparent)] px-[clamp(1.5rem,7vw,6.875rem)] backdrop-blur-lg max-[47.5rem]:h-16 max-[47.5rem]:grid-cols-[1fr_auto] max-[47.5rem]:px-5",
		brand:
			"inline-flex w-max items-center gap-3 text-lg font-[680] tracking-[-.03em]",
		brandMark: "size-9 rounded-lg shadow-[0_6px_18px_var(--black-a6)]",
		nav: "flex gap-[clamp(1.125rem,3vw,2.375rem)] text-sm font-medium text-text-muted max-[47.5rem]:hidden [&_a]:transition-colors [&_a]:duration-200 [&_a:hover]:text-text",
		headerDownload:
			"justify-self-end inline-flex items-center gap-2 rounded-full border border-line-strong bg-[var(--slate-a3)] px-4 py-2.5 text-sm font-[650] transition-colors duration-200 hover:bg-paper-surface hover:text-paper-text max-[47.5rem]:px-3 max-[47.5rem]:py-2",
		hero:
			"relative grid min-h-svh grid-cols-[minmax(22.5rem,.78fr)_minmax(33.75rem,1.22fr)] items-center gap-[clamp(2.5rem,6vw,6.25rem)] overflow-hidden bg-[radial-gradient(circle_at_74%_38%,var(--slate-a5),transparent_35%),linear-gradient(135deg,var(--slate-3)_0%,var(--slate-1)_55%,var(--slate-1)_100%)] px-[clamp(1.5rem,7vw,6.875rem)] pb-[6.625rem] pt-[9.625rem] before:absolute before:left-[-19.375rem] before:top-[22%] before:size-[32.5rem] before:rounded-full before:border before:border-[var(--amber-a4)] before:shadow-[0_0_0_110px_var(--amber-a2),0_0_0_220px_var(--amber-a2)] max-[65.625rem]:grid-cols-1 max-[65.625rem]:pt-[8.875rem] max-[47.5rem]:gap-8 max-[47.5rem]:px-5 max-[47.5rem]:pb-19 max-[47.5rem]:pt-30",
		heroNoise: "hero-noise pointer-events-none absolute inset-0 opacity-15",
		heroCopy: "relative z-[2] max-[65.625rem]:max-w-3xl",
		heroTitle:
			"m-0 text-[clamp(3.875rem,7.1vw,6.75rem)] font-[650] leading-[.91] tracking-[-.068em] max-[47.5rem]:text-[clamp(3.3125rem,16vw,4.75rem)] [&_em]:font-serif [&_em]:font-normal [&_em]:tracking-[-.055em] [&_em]:text-gold",
		heroLede:
			"mt-8 max-w-xl text-[clamp(1.0625rem,1.6vw,1.3125rem)] leading-[1.55] text-text-muted max-[47.5rem]:mt-6 max-[47.5rem]:text-base",
		heroActions: "mt-9 flex flex-wrap gap-3",
		heroNotes:
			"mt-8 flex flex-wrap gap-x-6 gap-y-4 text-xs text-text-subtle max-[47.5rem]:gap-3 [&_span]:inline-flex [&_span]:items-center [&_span]:gap-2",
		scrollCue:
			"absolute bottom-8 left-[clamp(1.5rem,7vw,6.875rem)] z-[2] flex items-center gap-2.5 text-[0.625rem] font-bold uppercase tracking-[.14em] text-text-subtle max-[65.625rem]:hidden",
		section: "px-[clamp(1.5rem,8vw,8.125rem)] py-[clamp(5.5rem,10vw,9.375rem)] max-[47.5rem]:px-5 max-[47.5rem]:py-20",
		paperSection: "bg-paper text-paper-text",
		sectionHeading:
			"[&_h2]:m-0 [&_h2]:text-[clamp(2.625rem,5vw,4.5rem)] [&_h2]:font-[580] [&_h2]:leading-[1.04] [&_h2]:tracking-[-.06em] max-[47.5rem]:[&_h2]:text-[2.75rem]",
		experienceHeading:
			"max-w-[70rem] [&_p:last-child]:mt-8 [&_p:last-child]:max-w-2xl [&_p:last-child]:border-l-2 [&_p:last-child]:border-accent [&_p:last-child]:pl-6 [&_p:last-child]:text-base [&_p:last-child]:leading-[1.65] [&_p:last-child]:text-paper-muted max-[47.5rem]:[&_p:last-child]:mt-6 max-[47.5rem]:[&_p:last-child]:pl-4 max-[47.5rem]:[&_p:last-child]:text-sm",
		featureList:
			"mt-20 border-t border-paper-line max-[47.5rem]:mt-12",
		featureRow:
			"grid min-h-37 grid-cols-[2.8125rem_3.625rem_1fr] items-center gap-6 border-b border-paper-line max-[47.5rem]:grid-cols-[2.625rem_1fr] max-[47.5rem]:gap-x-4 max-[47.5rem]:gap-y-3 max-[47.5rem]:py-6",
		featureNumber:
			"self-start pt-7 text-[0.625rem] tracking-[.12em] text-paper-subtle max-[47.5rem]:self-center max-[47.5rem]:pt-0",
		featureIcon:
			"grid size-14 place-items-center rounded-full border border-[var(--tomato-a6)] bg-[var(--tomato-a3)] text-accent max-[47.5rem]:row-start-2 max-[47.5rem]:size-10",
		featureCopy:
			"max-[47.5rem]:col-start-2 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-[650] [&_h3]:tracking-[-.035em] max-[47.5rem]:[&_h3]:text-lg [&_p]:max-w-[41.875rem] [&_p]:leading-[1.6] [&_p]:text-paper-muted",
		localSection:
			"grid min-h-[43.125rem] grid-cols-2 items-center gap-[9vw] overflow-hidden bg-accent px-[clamp(1.5rem,9vw,9.0625rem)] py-[clamp(5.5rem,9vw,8.75rem)] max-[65.625rem]:gap-[4vw] max-[47.5rem]:grid-cols-1 max-[47.5rem]:gap-12 max-[47.5rem]:px-5 max-[47.5rem]:py-20",
		localCopy:
			"text-accent-contrast [&_h2]:m-0 [&_h2]:text-[clamp(2.625rem,5vw,4.5rem)] [&_h2]:font-[580] [&_h2]:leading-[1.04] [&_h2]:tracking-[-.06em] max-[47.5rem]:[&_h2]:text-[2.75rem] [&>p:last-of-type]:my-8 [&>p:last-of-type]:max-w-[36.875rem] [&>p:last-of-type]:text-base [&>p:last-of-type]:leading-[1.65] [&>p:last-of-type]:text-[var(--tomato-3)] [&>a]:inline-flex [&>a]:items-center [&>a]:gap-2 [&>a]:border-b [&>a]:border-[var(--tomato-5)] [&>a]:pb-1 [&>a]:text-sm [&>a]:font-bold",
		localDiagram:
			"relative flex min-h-[24.375rem] flex-col items-center justify-center before:absolute before:size-[26.875rem] before:rounded-full before:border before:border-[var(--tomato-5)] before:shadow-[0_0_0_64px_var(--tomato-a3),0_0_0_128px_var(--tomato-a2)] max-[47.5rem]:min-h-[23.75rem] max-[47.5rem]:before:size-[19.375rem]",
		diagramNode:
			"relative z-[2] flex min-h-20 w-[min(20.9375rem,100%)] items-center gap-4 rounded-xl border border-line bg-surface-raised px-5 py-3.5 text-text shadow-[0_18px_45px_var(--black-a6)] [&_small]:block [&_small]:text-[0.5rem] [&_small]:font-bold [&_small]:tracking-[.12em] [&_small]:text-text-subtle [&_strong]:mt-1 [&_strong]:block [&_strong]:text-sm",
		diagramLogo: "w-12 rounded-xl",
		diagramLine:
			"relative z-[2] flex h-18 flex-col items-center [&_i]:w-px [&_i]:flex-1 [&_i]:bg-[var(--tomato-5)] [&_span]:rounded-full [&_span]:border [&_span]:border-[var(--tomato-5)] [&_span]:px-2.5 [&_span]:py-1 [&_span]:font-mono [&_span]:text-[0.5625rem] [&_span]:text-[var(--tomato-3)]",
		privacySeal:
			"absolute bottom-[15%] right-[3%] z-[3] flex -rotate-[4deg] items-center gap-2.5 rounded-lg bg-surface-raised px-3.5 py-3 text-text shadow-[0_12px_35px_var(--black-a6)] max-[47.5rem]:right-0 [&_strong]:block [&_strong]:text-xs [&_small]:block [&_small]:text-[0.5625rem] [&_small]:text-text-subtle",
		faqHeading: "flex items-end justify-between [&>svg]:text-accent",
		faqList:
			"mt-17 border-t border-paper-line max-[47.5rem]:mt-11",
		faqItem: "border-b border-paper-line",
		faqTrigger:
			"grid min-h-20 w-full cursor-pointer grid-cols-[2.875rem_1fr_auto] items-center gap-4 border-0 bg-transparent p-0 text-left text-paper-text max-[47.5rem]:min-h-18 max-[47.5rem]:grid-cols-[1.875rem_1fr_auto] max-[47.5rem]:gap-2.5 [&>span:nth-child(2)]:text-lg [&>span:nth-child(2)]:font-[640] [&>span:nth-child(2)]:tracking-[-.025em] max-[47.5rem]:[&>span:nth-child(2)]:text-base",
		faqNumber: "text-[0.5625rem] tracking-[.1em] text-paper-subtle",
		faqIndicator:
			"transition-transform duration-200 data-[state=open]:rotate-180 data-[state=open]:text-accent",
		faqContent:
			"overflow-hidden data-[state=closed]:animate-[collapse_.2s_ease-in] data-[state=open]:animate-[expand_.25s_ease-out] [&_p]:mb-7 [&_p]:ml-16 [&_p]:-mt-px [&_p]:max-w-[48.75rem] [&_p]:leading-[1.65] [&_p]:text-paper-muted max-[47.5rem]:[&_p]:ml-10",
		closingSection:
			"flex min-h-[40.625rem] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_45%,var(--slate-4)_0,var(--slate-2)_40%,var(--slate-1)_72%)] px-6 py-25 text-center",
		closingMark: "mb-8 w-19 rounded-2xl shadow-[0_18px_40px_var(--black-a7)]",
		closingTitle:
			"m-0 max-w-[53.125rem] text-[clamp(3rem,6vw,5.25rem)] font-[580] leading-[1.04] tracking-[-.06em] [&_em]:font-serif [&_em]:font-normal [&_em]:tracking-[-.055em] [&_em]:text-gold",
		footer:
			"grid grid-cols-[1fr_auto_1fr] items-center gap-8 border-t border-line bg-canvas px-[clamp(1.5rem,7vw,6.875rem)] py-11 text-text-subtle max-[65.625rem]:grid-cols-[1fr_auto] max-[47.5rem]:grid-cols-1",
		footerBrand:
			"flex items-center gap-3 [&_strong]:block [&_strong]:text-sm [&_strong]:text-text [&_span]:mt-0.5 [&_span]:block [&_span]:text-[0.625rem]",
		footerMark: "w-10 rounded-lg",
		footerLinks:
			"flex gap-6 text-xs max-[47.5rem]:flex-wrap [&_a]:transition-colors [&_a]:duration-200 [&_a:hover]:text-text",
		footerLegal:
			"max-w-[24.375rem] justify-self-end text-right text-[0.5625rem] leading-normal max-[65.625rem]:col-span-full max-[65.625rem]:justify-self-stretch max-[65.625rem]:text-left max-[47.5rem]:col-auto [&_p]:my-1",
		notFound:
			"flex min-h-svh flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_42%,var(--slate-4),var(--slate-1)_56%)] px-6 py-20 text-center [&_h1]:m-0 [&_h1]:text-[clamp(3.25rem,8vw,5.75rem)] [&_h1]:leading-[.98] [&_h1]:tracking-[-.065em] [&>p:last-of-type]:mb-8 [&>p:last-of-type]:mt-6 [&>p:last-of-type]:text-text-muted",
	},
});
