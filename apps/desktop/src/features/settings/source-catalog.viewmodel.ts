// Coordinates source catalog previews, explicit replacement and native export.
import { ConnectError, type SourceCatalogPreview } from "@popcorn/sdk";
import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import type { SourceCatalogClient } from "../../shared/types";

const MAX_BYTES = 32 * 1024 * 1024;
const options = { timeoutMs: 60_000 };

function errorText(error: unknown): string {
  if (error instanceof ConnectError) {
    if (error.rawMessage === "SOURCE_IN_USE")
      return "Encerre a reprodução antes de substituir seu catálogo.";
    if (error.rawMessage === "CATALOG_CHANGED")
      return "Seu catálogo mudou. Selecione o arquivo novamente para revisar a prévia atualizada.";
    if (error.rawMessage === "SOURCE_INVALID")
      return "Catálogo inválido, versão não suportada ou limite excedido. Nenhuma fonte foi alterada.";
  }
  return "Não foi possível concluir a operação. Verifique a conexão e tente novamente.";
}

export function createSourceCatalogViewModel(
  getClient: () => SourceCatalogClient | undefined,
  saveDocument: (document: string) => Promise<boolean> = (document) =>
    invoke<boolean>("save_source_catalog", { document }),
) {
  const [name, setName] = createSignal("Meu catálogo");
  const [description, setDescription] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [preview, setPreview] = createSignal<SourceCatalogPreview>();
  const [replace, setReplace] = createSignal(false);
  const [confirmed, setConfirmed] = createSignal(false);
  let document = "";
  let previewClient: SourceCatalogClient | undefined;

  function cancel() {
    if (busy()) return;
    document = "";
    previewClient = undefined;
    setPreview(undefined);
    setReplace(false);
    setConfirmed(false);
    setError("");
  }

  async function exportCatalog() {
    const client = getClient();
    if (!client || busy()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await client.exportSourceCatalog(
        { name: name().trim(), description: description() },
        options,
      );
      if (await saveDocument(result.document)) setMessage("Catálogo exportado.");
    } catch (cause) {
      setError(typeof cause === "string" ? cause : errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    const client = getClient();
    if (!client || busy()) return;
    cancel();
    setBusy(true);
    setMessage("");
    try {
      if (file.size > MAX_BYTES) {
        setError("Escolha um catálogo com até 32 MB.");
        return;
      }
      const candidate = await file.text();
      const result = await client.previewSourceCatalog({ document: candidate }, options);
      if (!result.preview || getClient() !== client) throw new Error("preview unavailable");
      document = candidate;
      previewClient = client;
      setPreview(result.preview);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function importCatalog(): Promise<boolean> {
    const client = getClient();
    const current = preview();
    if (!client || busy() || !current || (replace() && !confirmed())) return false;
    if (client !== previewClient) {
      cancel();
      setError("A conexão mudou. Selecione o arquivo novamente para revisar a prévia.");
      return false;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await client.importSourceCatalog(
        { document, replace: replace(), expectedRevision: current.revision },
        options,
      );
      setMessage(
        replace()
          ? `Catálogo substituído: ${current.sources} fontes e ${current.bindings} associações.`
          : `Catálogo mesclado: ${current.sources - current.existingSources - current.reactivatedSources} fontes novas, ${current.reactivatedSources} reativadas e ${current.bindings} associações processadas.`,
      );
      setBusy(false);
      cancel();
      return true;
    } catch (cause) {
      setError(errorText(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    name,
    setName,
    description,
    setDescription,
    busy,
    error,
    message,
    preview,
    replace,
    setReplace: (value: boolean) => {
      setReplace(value);
      setConfirmed(false);
    },
    confirmed,
    setConfirmed,
    cancel,
    exportCatalog,
    importFile,
    importCatalog,
  };
}

export type SourceCatalogViewModel = ReturnType<typeof createSourceCatalogViewModel>;
