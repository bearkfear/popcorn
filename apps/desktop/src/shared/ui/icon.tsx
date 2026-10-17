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
import { tv } from "tailwind-variants";

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

const iconStyles = tv({ base: "app-icon inline-block flex-none align-[-0.125em] size-[1em]" });

export type IconName = keyof typeof icons;

export function Icon(props: { readonly name: IconName; readonly class?: string }) {
  return (
    <Dynamic
      component={icons[props.name]}
      class={iconStyles({ class: props.class })}
      aria-hidden="true"
      stroke-width={2}
    />
  );
}
