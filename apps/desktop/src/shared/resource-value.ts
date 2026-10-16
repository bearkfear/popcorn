import { createMemo, type Resource } from "solid-js";

// A failed refresh keeps the last good value while the view displays resource.error.
// Reading .latest directly throws on an error and can tear down the whole page.
export function resourceValue<T>(resource: Resource<T>) {
  return createMemo<T | undefined>((previous) => (resource.error ? previous : resource.latest));
}
