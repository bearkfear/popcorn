import { describe, expect, mock, test } from "bun:test";
import { Code, ConnectError, type SourceCatalogPreview } from "@popcorn/sdk";
import { createSourceCatalogViewModel } from "../src/features/settings/source-catalog.viewmodel";
import type { SourceCatalogClient } from "../src/shared/types";

const preview: SourceCatalogPreview = {
  $typeName: "popcorn.v1.SourceCatalogPreview",
  name: "Seleção",
  sources: 3,
  bindings: 4,
  movies: 2,
  series: 1,
  existingSources: 1,
  reactivatedSources: 1,
  localSources: 7,
  revision: "revision-1",
};
function setup() {
  const imported = mock(async (_request: unknown, _options: unknown) => ({ preview }));
  const exported = mock(async () => ({ document: "portable-json" }));
  const inspected = mock(async () => ({ preview }));
  const saved = mock(async (_document: string) => true);
  const client = {
    importSourceCatalog: imported,
    exportSourceCatalog: exported,
    previewSourceCatalog: inspected,
  } as unknown as SourceCatalogClient;
  const vm = createSourceCatalogViewModel(() => client, saved);
  return { vm, imported, exported, inspected, saved, client };
}
const file = () => new File(["catalog-json"], "selection.popcatalog");

describe("portable source catalog", () => {
  test("preview makes no changes and merge sends the exact reviewed document and revision", async () => {
    const { vm, imported } = setup();
    await vm.importFile(file());
    expect(imported).not.toHaveBeenCalled();
    expect(vm.replace()).toBe(false);
    expect(await vm.importCatalog()).toBe(true);
    expect(imported).toHaveBeenCalledWith(
      { document: "catalog-json", replace: false, expectedRevision: "revision-1" },
      { timeoutMs: 60_000 },
    );
    expect(vm.preview()).toBeUndefined();
    expect(vm.message()).toContain("1 fontes novas");
  });
  test("replacement requires explicit confirmation, reset when switching modes", async () => {
    const { vm, imported } = setup();
    await vm.importFile(file());
    vm.setReplace(true);
    expect(await vm.importCatalog()).toBe(false);
    expect(imported).not.toHaveBeenCalled();
    vm.setConfirmed(true);
    vm.setReplace(false);
    vm.setReplace(true);
    expect(vm.confirmed()).toBe(false);
    vm.setConfirmed(true);
    expect(await vm.importCatalog()).toBe(true);
    expect(imported.mock.calls[0]?.[0]).toMatchObject({ replace: true });
  });
  test("a rejected import keeps the preview available and reports no success", async () => {
    const { vm, imported } = setup();
    await vm.importFile(file());
    imported.mockImplementation(async () => {
      throw new ConnectError("CATALOG_CHANGED", Code.FailedPrecondition);
    });
    expect(await vm.importCatalog()).toBe(false);
    expect(vm.error()).toContain("catálogo mudou");
    expect(vm.message()).toBe("");
    expect(vm.preview()).toBeDefined();
  });
  test("cancel and oversized files discard previous destructive confirmation", async () => {
    const { vm, inspected } = setup();
    await vm.importFile(file());
    vm.setReplace(true);
    vm.setConfirmed(true);
    await vm.importFile(new File([new Uint8Array(32 * 1024 * 1024 + 1)], "large.popcatalog"));
    expect(inspected).toHaveBeenCalledTimes(1);
    expect(vm.preview()).toBeUndefined();
    expect(vm.confirmed()).toBe(false);
    expect(vm.error()).toContain("32 MB");
  });
  test("export saves the backend document and cancellation is not reported as success", async () => {
    const { vm, saved } = setup();
    await vm.exportCatalog();
    expect(saved).toHaveBeenCalledWith("portable-json");
    expect(vm.message()).toBe("Catálogo exportado.");
    saved.mockImplementation(async () => false);
    await vm.exportCatalog();
    expect(vm.message()).toBe("");
    expect(vm.error()).toBe("");
  });
  test("a reconnected backend cannot import a preview from the old connection", async () => {
    const { client, imported } = setup();
    let current = client;
    const vm = createSourceCatalogViewModel(() => current);
    await vm.importFile(file());
    current = { ...client };
    expect(await vm.importCatalog()).toBe(false);
    expect(imported).not.toHaveBeenCalled();
    expect(vm.error()).toContain("conexão mudou");
  });
});
