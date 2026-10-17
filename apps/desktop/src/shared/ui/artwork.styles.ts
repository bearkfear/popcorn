import { tv } from "tailwind-variants";

export const artworkStyles = tv({
  slots: {
    root: [
      "artwork relative grid w-full aspect-[2_/_3] place-items-center overflow-hidden rounded-[4px]",
      "[background:linear-gradient(145deg,_var(--slate-5),_var(--slate-3))] text-muted",
    ],
    empty:
      "artwork-empty p-3 text-muted text-[12px] font-bold tracking-[0.08em] text-center uppercase",
    image: "size-full object-cover",
  },
  variants: {
    wide: {
      true: {
        root: "artwork-wide aspect-video",
      },
    },
  },
});
