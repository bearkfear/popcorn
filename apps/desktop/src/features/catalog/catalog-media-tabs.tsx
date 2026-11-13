import { Tabs } from "@egcs/newui/navigation";
import { MediaType } from "@popcorn/sdk";
import type { JSX } from "solid-js";
import type { CatalogViewModel } from "./catalog.viewmodel";

export function CatalogMediaTabs(props: {
  readonly vm: CatalogViewModel;
  readonly librarySelected: boolean;
  readonly onLibraryChange: (selected: boolean) => void;
  readonly children: JSX.Element;
}) {
  return (
    <Tabs.Root
      variant="underline"
      tone="primary"
      value={props.librarySelected ? "library" : String(props.vm.mediaType())}
      onValueChange={({ value }) => {
        if (!value) return;
        props.onLibraryChange(value === "library");
        if (value !== "library" && Number(value) !== props.vm.mediaType())
          props.vm.changeMediaType(Number(value) as MediaType);
      }}
    >
      <Tabs.List class="mb-4" aria-label="Seção de exploração">
        <Tabs.Trigger value={String(MediaType.MOVIE)}>Filmes</Tabs.Trigger>
        <Tabs.Trigger value={String(MediaType.TV)}>Séries</Tabs.Trigger>
        <Tabs.Trigger value="library">Minha biblioteca</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value={String(MediaType.MOVIE)}>
        {!props.librarySelected && props.vm.mediaType() === MediaType.MOVIE && props.children}
      </Tabs.Content>
      <Tabs.Content value={String(MediaType.TV)}>
        {!props.librarySelected && props.vm.mediaType() === MediaType.TV && props.children}
      </Tabs.Content>
      <Tabs.Content value="library">{props.librarySelected && props.children}</Tabs.Content>
    </Tabs.Root>
  );
}
