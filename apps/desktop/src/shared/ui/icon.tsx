import {
  ArrowLeft,
  Check,
  ChevronDown,
  FastForward,
  LoaderCircle,
  Maximize,
  Pause,
  PictureInPicture,
  Play,
  Plus,
  Rewind,
  Star,
  Volume2,
  VolumeX,
} from "lucide-solid";
import { Dynamic } from "solid-js/web";

const icons = {
  "arrow-left": ArrowLeft,
  "caret-down": ChevronDown,
  check: Check,
  "corners-out": Maximize,
  "fast-forward": FastForward,
  loading: LoaderCircle,
  pause: Pause,
  "picture-in-picture": PictureInPicture,
  play: Play,
  plus: Plus,
  rewind: Rewind,
  "speaker-high": Volume2,
  "speaker-slash": VolumeX,
  star: Star,
};

export type IconName = keyof typeof icons;

export function Icon(props: { readonly name: IconName; readonly class?: string }) {
  return (
    <Dynamic
      component={icons[props.name]}
      class={`app-icon inline-block flex-none align-[-0.125em] ${props.class ?? "size-[1em]"}`}
      aria-hidden="true"
      stroke-width={2}
    />
  );
}
