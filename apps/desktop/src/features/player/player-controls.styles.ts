import { tv } from "tailwind-variants";

export const playerButtonStyles = tv({
  base: [
    "grid place-items-center shrink-0 p-1 border-0 rounded-md text-ink bg-transparent [&:hover]:bg-white-a2",
    "[&:active]:opacity-[0.65]",
  ],
  variants: {
    size: {
      default: "size-8",
      play: "size-10 video-play-toggle [&[aria-label=Reproduzir]_.app-icon]:translate-x-px",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export const playerRangeStyles = tv({
  base: [
    "appearance-none border-0 rounded-panel",
    "cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4",
    "[&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink",
    "[&::-webkit-slider-thumb]:shadow-[0_1px_3px_var(--black-a5)] [&::-moz-range-thumb]:size-4",
    "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink",
  ],
  variants: {
    kind: {
      timeline: "relative bg-transparent",
      volume: [
        "video-volume h-[5px] w-[72px] min-w-[30px] max-[540px]:hidden",
        "bg-[linear-gradient(to_right,var(--slate-12)_var(--range-progress,0%),var(--white-a3)_var(--range-progress,0%))]",
      ],
    },
  },
  defaultVariants: {
    kind: "timeline",
  },
});

export const playerControlsStyles = tv({
  slots: {
    panel: [
      "video-controls absolute bottom-[clamp(18px,_5vh,_44px)] left-[50%] w-[min(600px,_calc(100%_-_32px))] m-0",
      "min-w-0 p-[18px_22px_16px] border border-white-a2 rounded-[22px] bg-slate-3",
      "shadow-[0_8px_32px_var(--black-a6),_inset_0_1px_0_var(--white-a1)] backdrop-blur-[24px] text-ink",
      "[transform:translateX(-50%)] opacity-0 pointer-events-none [transition:opacity_180ms_ease]",
      "max-[540px]:p-[14px_12px]",
      "max-[540px]:rounded-[16px] motion-reduce:[transition:none]",
    ],
    top: [
      "video-controls-top grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-[18px]",
      "max-[540px]:grid-cols-[1fr_auto_1fr] max-[540px]:gap-x-1 max-[540px]:gap-y-3",
    ],
    volumeGroup: ["video-volume-group flex items-center gap-3 min-w-0 max-[540px]:hidden"],
    transportGroup: [
      "video-transport-group flex items-center gap-3 min-w-0 justify-center max-[540px]:gap-1",
      "max-[540px]:col-start-2",
    ],
    presentationGroup: [
      "video-presentation-group flex items-center gap-2 min-w-0 justify-end max-[540px]:col-span-full",
      "max-[540px]:gap-1",
    ],
    audioField: [
      "video-audio-field [flex:0_1_112px] min-w-0 max-[540px]:mr-auto max-[540px]:[flex-basis:160px]",
    ],
    timeline: [
      "video-timeline flex items-center gap-[10px] text-[13px] font-semibold tabular-nums [&_span]:shrink-0",
      "max-[540px]:gap-2 max-[540px]:text-[11px]",
    ],
    timelineLayers: [
      "video-timeline-layers absolute inset-x-2 top-1/2 -translate-y-1/2 h-[var(--timeline-height)]",
      "overflow-hidden rounded-full bg-white-a3 pointer-events-none [transition:height_var(--timeline-transition)_ease]",
    ],
    downloadSegment: ["video-download-segment absolute inset-y-0 bg-white-a5"],
    bufferSegment: ["video-buffer-segment absolute inset-y-0 bg-white-a8"],
    playedSegment: ["video-played-segment absolute inset-y-0 bg-ink"],
    timelineTrack: [
      "video-timeline-track [--timeline-scale:1] [--timeline-height:5px] [--timeline-transition:150ms] relative",
      "flex items-center [flex:1] min-w-[20px] h-[32px] [&:hover]:[--timeline-scale:1.5]",
      "[&:hover]:[--timeline-height:8px] [&:focus-within]:[--timeline-scale:1.5]",
      "[&:focus-within]:[--timeline-height:8px] [&:has([aria-busy=true])]:[--timeline-scale:1.5]",
      "[&:has([aria-busy=true])]:[--timeline-height:8px] [&_input]:w-full [&_input]:min-w-0 [&_input]:m-0",
      "[&_input]:h-[var(--timeline-height)] [&_input]:[transition:height_var(--timeline-transition)_ease]",
      "[&_input::-webkit-slider-thumb]:[transform:scale(var(--timeline-scale))]",
      "[&_input::-webkit-slider-thumb]:[transition:transform_var(--timeline-transition)_ease]",
      "[&_input::-moz-range-thumb]:[transform:scale(var(--timeline-scale))]",
      "[&_input::-moz-range-thumb]:[transition:transform_var(--timeline-transition)_ease]",
      "motion-reduce:[--timeline-transition:0ms]",
    ],
    seekIndicators: ["video-seek-indicators absolute inset-[0_8px] pointer-events-none"],
    seekLoading: [
      "video-seek-loading absolute top-[50%] left-[var(--range-progress,_0%)] grid place-items-center w-[16px]",
      "h-[16px] rounded-full bg-ink text-slate-3 [transform:translate(-50%,_-50%)_scale(var(--timeline-scale))]",
      "[transition:transform_var(--timeline-transition)_ease]",
    ],
    icon: ["size-6 text-2xl text-center"],
    transportIcon: ["size-6 text-2xl text-center fill-current stroke-[1.5]"],
    playIcon: ["size-7 text-2xl text-center fill-current stroke-[1.5]"],
    loadingIcon: [
      "size-3 text-2xl text-center stroke-[2.5] animate-spin [animation-duration:800ms]",
      "motion-reduce:[animation-duration:1600ms]",
    ],
  },
  variants: {
    visible: {
      true: {
        panel: "is-visible opacity-100 pointer-events-auto",
      },
    },
  },
  defaultVariants: {
    visible: false,
  },
});
