import { ToggleGroup } from "@ark-ui/solid/toggle-group";
import { MediaType } from "@popcorn/sdk";
import type { CatalogViewModel } from "./catalog.viewmodel";

export function CatalogMediaTabs(props: {
  readonly vm: CatalogViewModel;
  readonly librarySelected: boolean;
  readonly onLibraryChange: (selected: boolean) => void;
}) {
  return (
    <ToggleGroup.Root
      class="media-tabs mb-6 flex items-center gap-7 overflow-x-auto border-b border-slate-6 max-[560px]:gap-5"
      aria-label="Seção de exploração"
      value={[props.librarySelected ? "library" : String(props.vm.mediaType())]}
      onValueChange={({ value }) => {
        if (!value[0]) return;
        props.onLibraryChange(value[0] === "library");
        if (value[0] !== "library" && Number(value[0]) !== props.vm.mediaType()) {
          props.vm.changeMediaType(Number(value[0]) as MediaType);
        }
      }}
    >
      <ToggleGroup.Item
        class="min-h-14 shrink-0 border-b-2 border-transparent text-2xl font-medium tracking-[-0.025em] text-muted transition-colors hover:text-ink data-[state=on]:border-accent data-[state=on]:text-ink max-[560px]:text-xl"
        value={String(MediaType.MOVIE)}
      >
        Filmes
      </ToggleGroup.Item>
      <ToggleGroup.Item
        class="min-h-14 shrink-0 border-b-2 border-transparent text-2xl font-medium tracking-[-0.025em] text-muted transition-colors hover:text-ink data-[state=on]:border-accent data-[state=on]:text-ink max-[560px]:text-xl"
        value={String(MediaType.TV)}
      >
        Séries
      </ToggleGroup.Item>
      <ToggleGroup.Item
        class="min-h-14 shrink-0 border-b-2 border-transparent text-2xl font-medium tracking-[-0.025em] text-muted transition-colors hover:text-ink data-[state=on]:border-accent data-[state=on]:text-ink max-[560px]:text-xl"
        value="library"
      >
        Minha biblioteca
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
