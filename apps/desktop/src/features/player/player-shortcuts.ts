// Maps unmodified playback keys; editable controls retain their native keyboard behavior.
export type PlayerAction =
  | "play"
  | "back"
  | "forward"
  | "volume-up"
  | "volume-down"
  | "mute"
  | "fullscreen"
  | "pip";

export function playerShortcut(
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  editing: boolean,
): PlayerAction | undefined {
  if (editing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  switch (event.key.toLowerCase()) {
    case " ":
    case "k":
      return "play";
    case "arrowleft":
    case "j":
      return "back";
    case "arrowright":
    case "l":
      return "forward";
    case "arrowup":
      return "volume-up";
    case "arrowdown":
      return "volume-down";
    case "m":
      return "mute";
    case "f":
      return "fullscreen";
    case "p":
      return "pip";
    default:
      return undefined;
  }
}
