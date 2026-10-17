// Expõe a marca vetorial reutilizável do Popcorn.
interface BrandMarkProps {
	class?: string;
	title?: string;
}

export function BrandMark(props: BrandMarkProps) {
	return (
		<svg
			class={props.class}
			viewBox="0 0 512 512"
			role={props.title ? "img" : undefined}
			aria-hidden={props.title ? undefined : "true"}
			aria-label={props.title}
		>
			<rect width="512" height="512" rx="112" fill="var(--sand-1)" />
			<g fill="var(--amber-9)">
				<circle cx="187" cy="174" r="66" />
				<circle cx="256" cy="129" r="66" />
				<circle cx="325" cy="174" r="66" />
				<circle cx="256" cy="205" r="72" />
			</g>
			<path d="M128 238h256l-34 152H162z" fill="var(--sand-12)" />
			<path d="m217 266 10 98m68-98-10 98" stroke="var(--sand-1)" stroke-width="22" />
		</svg>
	);
}
