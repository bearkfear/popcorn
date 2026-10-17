// Shared utilities for the native player buttons and range inputs.
export const playerButtonStyles =
  "grid place-items-center shrink-0 p-1 border-0 rounded-md text-ink bg-transparent [&:hover]:bg-white-a2 [&:active]:opacity-[0.65]";

export const playerRangeStyles =
  "appearance-none border-0 rounded-panel bg-[linear-gradient(to_right,var(--slate-12)_var(--range-progress,0%),var(--white-a3)_var(--range-progress,0%))] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink [&::-webkit-slider-thumb]:shadow-[0_1px_3px_var(--black-a5)] [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-ink";
