import { createEffect, createSignal, onCleanup } from "solid-js";

export function createSelectScrollDismiss(getContent: () => HTMLElement | undefined) {
  const [open, setOpen] = createSignal(false);

  createEffect(() => {
    if (!open()) return;

    const onScroll = (event: Event) => {
      if (event.target instanceof Node && getContent()?.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    onCleanup(() => window.removeEventListener("scroll", onScroll, true));
  });

  return { open, setOpen };
}
