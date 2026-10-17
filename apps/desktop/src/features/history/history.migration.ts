import type { HistoryClient } from "../../shared/types";
import { readHistory } from "./history.model";

const STORAGE_KEY = "popcorn.watch-history.v1";

export async function loadHistory(client: HistoryClient) {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return client.listHistory({});
  }
  const entries = readHistory(raw);
  if (!entries.length) return client.listHistory({});
  // Import only inserts missing entries, so an interrupted migration is safe to retry.
  const result = await client.importHistory({ entries });
  try {
    if (localStorage.getItem(STORAGE_KEY) === raw) localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The server already saved the entries; retaining the legacy copy is safe.
  }
  return result;
}
