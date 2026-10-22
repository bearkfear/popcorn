// Autoplay policy and interrupted play requests leave the regular play control usable.
export function playbackDeferred(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}
